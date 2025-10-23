import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;

public class TaskUtilServer {
    private static final SecureRandom RANDOM = new SecureRandom();

    public static void main(String[] args) throws IOException {
        int port = 8787;
        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);

        server.createContext("/ping", new TextHandler("ok"));
        server.createContext("/uid", new UidHandler());

        server.setExecutor(null);
        System.out.println("TaskUtilServer listening on http://localhost:" + port);
        server.start();
    }

    static class TextHandler implements HttpHandler {
        private final String text;
        TextHandler(String text) { this.text = text; }
        @Override public void handle(HttpExchange exchange) throws IOException {
            byte[] body = text.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "text/plain; charset=utf-8");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
        }
    }

    static class UidHandler implements HttpHandler {
        @Override public void handle(HttpExchange exchange) throws IOException {
            String id = generateTimeRandomId();
            String json = "{\"id\":\"" + id + "\"}";
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json; charset=utf-8");
            exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, body.length);
            try (OutputStream os = exchange.getResponseBody()) { os.write(body); }
        }

        private String generateTimeRandomId() {
            long millis = Instant.now().toEpochMilli();
            byte[] rnd = new byte[6];
            RANDOM.nextBytes(rnd);
            return toBase36(millis) + toBase36(bytesToLong(rnd));
        }

        private String toBase36(long v) {
            String s = Long.toString(v, 36);
            return s;
        }

        private long bytesToLong(byte[] b) {
            long v = 0;
            for (byte x : b) {
                v = (v << 8) | (x & 0xff);
            }
            return v & 0x3fffffffffffffL; // keep positive
        }
    }
}

