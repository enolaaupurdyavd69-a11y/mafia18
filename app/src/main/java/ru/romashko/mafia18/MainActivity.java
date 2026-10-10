package ru.romashko.mafia18;

import android.app.Activity;
import android.content.Context;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Тонкая оболочка: вся игра — HTML/JS в assets. Здесь только то, чего нет у страницы:
 * сервер в Wi-Fi на телефоне-хозяине, поиск игр в сети (NSD), экран не гаснет, вибрация.
 * Запрос гостя сервер отдаёт странице хозяина (take), её ответ — гостю (reply).
 */
public class MainActivity extends Activity {
    static final String SERVICE = "_mafia18._tcp.";

    WebView web;
    NsdManager nsd;
    WifiManager.MulticastLock lock;
    volatile ServerSocket server;
    NsdManager.RegistrationListener reg;
    NsdManager.DiscoveryListener disc;
    final LinkedBlockingQueue<JSONObject> inbox = new LinkedBlockingQueue<>();
    final Map<Integer, LinkedBlockingQueue<String>> waiting = new ConcurrentHashMap<>();
    final AtomicInteger ids = new AtomicInteger();
    final Map<String, JSONObject> games = new ConcurrentHashMap<>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(0xFF140F1F);
        getWindow().setNavigationBarColor(0xFF140F1F);
        nsd = (NsdManager) getSystemService(Context.NSD_SERVICE);
        web = new WebView(this);
        web.setBackgroundColor(0xFF140F1F);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", v -> {
            if (!"true".equals(v)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        stopHost();
        stopScan();
        super.onDestroy();
    }

    // ---------- сервер хозяина ----------

    int startHost(String name) throws Exception {
        stopHost();
        ServerSocket ss = new ServerSocket(0);
        server = ss;
        new Thread(() -> {
            while (!ss.isClosed()) {
                try {
                    Socket c = ss.accept();
                    new Thread(() -> serve(c)).start();
                } catch (Exception e) { break; }
            }
        }).start();
        NsdServiceInfo info = new NsdServiceInfo();
        info.setServiceName(name);
        info.setServiceType(SERVICE);
        info.setPort(ss.getLocalPort());
        reg = new NsdManager.RegistrationListener() {
            public void onServiceRegistered(NsdServiceInfo i) {}
            public void onRegistrationFailed(NsdServiceInfo i, int e) {}
            public void onServiceUnregistered(NsdServiceInfo i) {}
            public void onUnregistrationFailed(NsdServiceInfo i, int e) {}
        };
        nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, reg);
        return ss.getLocalPort();
    }

    void stopHost() {
        try { if (reg != null) nsd.unregisterService(reg); } catch (Exception ignored) {}
        reg = null;
        try { if (server != null) server.close(); } catch (Exception ignored) {}
        server = null;
    }

    static String readLine(InputStream in) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        for (int ch; (ch = in.read()) != -1 && ch != '\n'; ) if (ch != '\r') b.write(ch);
        return b.toString("UTF-8");
    }

    /** Один HTTP-запрос гостя: POST с JSON. Ответ ждём от страницы хозяина до 30 с. */
    void serve(Socket c) {
        try (Socket sock = c) {
            sock.setSoTimeout(35000);
            InputStream in = sock.getInputStream();
            String first = readLine(in);
            int len = 0;
            for (String line; !(line = readLine(in)).isEmpty(); ) {
                if (line.toLowerCase().startsWith("content-length:")) len = Integer.parseInt(line.substring(15).trim());
            }
            String reply = "{}";
            int code = 200;
            if (first.startsWith("POST")) {
                byte[] buf = new byte[len];
                int got = 0;
                while (got < len) { int n = in.read(buf, got, len - got); if (n < 0) break; got += n; }
                int id = ids.incrementAndGet();
                LinkedBlockingQueue<String> q = new LinkedBlockingQueue<>();
                waiting.put(id, q);
                JSONObject req = new JSONObject();
                req.put("id", id);
                req.put("ip", sock.getInetAddress().getHostAddress());
                req.put("body", new String(buf, 0, got, StandardCharsets.UTF_8));
                inbox.put(req);
                String r = q.poll(30, TimeUnit.SECONDS);
                waiting.remove(id);
                if (r == null) code = 504; else reply = r;
            }
            byte[] out = reply.getBytes(StandardCharsets.UTF_8);
            OutputStream os = sock.getOutputStream();
            os.write(("HTTP/1.1 " + code + " OK\r\nContent-Type: application/json; charset=utf-8\r\n"
                    + "Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Content-Type\r\n"
                    + "Access-Control-Allow-Methods: POST, OPTIONS\r\nContent-Length: " + out.length
                    + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
            os.write(out);
            os.flush();
        } catch (Exception ignored) {}
    }

    // ---------- поиск игр ----------

    void startScan() {
        stopScan();
        games.clear();
        WifiManager wifi = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        lock = wifi.createMulticastLock("mafia18");
        lock.setReferenceCounted(false);
        lock.acquire();
        disc = new NsdManager.DiscoveryListener() {
            public void onDiscoveryStarted(String t) {}
            public void onDiscoveryStopped(String t) {}
            public void onStartDiscoveryFailed(String t, int e) {}
            public void onStopDiscoveryFailed(String t, int e) {}
            public void onServiceLost(NsdServiceInfo i) { games.remove(i.getServiceName()); }
            public void onServiceFound(NsdServiceInfo i) {
                nsd.resolveService(i, new NsdManager.ResolveListener() {
                    public void onResolveFailed(NsdServiceInfo x, int e) {}
                    public void onServiceResolved(NsdServiceInfo x) {
                        try {
                            JSONObject g = new JSONObject();
                            g.put("name", x.getServiceName());
                            g.put("host", x.getHost().getHostAddress());
                            g.put("port", x.getPort());
                            games.put(x.getServiceName(), g);
                        } catch (Exception ignored) {}
                    }
                });
            }
        };
        nsd.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, disc);
    }

    void stopScan() {
        try { if (disc != null) nsd.stopServiceDiscovery(disc); } catch (Exception ignored) {}
        disc = null;
        if (lock != null && lock.isHeld()) lock.release();
    }

    static String myIp() {
        try {
            for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!n.isUp() || n.isLoopback()) continue;
                for (InetAddress a : Collections.list(n.getInetAddresses())) {
                    if (a instanceof Inet4Address && a.isSiteLocalAddress()) return a.getHostAddress();
                }
            }
        } catch (Exception ignored) {}
        return "";
    }

    /** Методы, доступные странице как window.Android.* */
    class Bridge {
        @JavascriptInterface public int hostStart(String name) {
            try { return startHost(name); } catch (Exception e) { return 0; }
        }
        @JavascriptInterface public void hostStop() { stopHost(); }
        @JavascriptInterface public String take() {
            List<JSONObject> got = new ArrayList<>();
            inbox.drainTo(got);
            return new JSONArray(got).toString();
        }
        @JavascriptInterface public void reply(int id, String json) {
            LinkedBlockingQueue<String> q = waiting.get(id);
            if (q != null) q.offer(json);
        }
        @JavascriptInterface public void scanStart() { runOnUiThread(MainActivity.this::startScan); }
        @JavascriptInterface public void scanStop() { runOnUiThread(MainActivity.this::stopScan); }
        @JavascriptInterface public String games() { return new JSONArray(games.values()).toString(); }
        @JavascriptInterface public String ip() { return myIp(); }
        @JavascriptInterface public void awake(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }
        @JavascriptInterface public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        }
    }
}
