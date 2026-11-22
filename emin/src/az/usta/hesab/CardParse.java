package az.usta.hesab;

import org.json.JSONObject;

import java.util.Calendar;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * One bank notification (title + text) → one card operation, or the reason it is not one.
 * Pure Java (no Android), so it can be tested on its own.
 *
 * Rev. 15: words are compared without caring about capitals in Azerbaijani letters too
 * («Ödəniş» = «ödəniş», before only English letters were), the sign may be missing
 * (then the words decide), «–» is a minus too, the currency may stand before the amount,
 * card numbers like 4169****4590 are read, and 3D Secure «təsdiqləyin» requests are skipped.
 */
final class CardParse {

    /** Result: op != null when it is an operation; otherwise why it is not. */
    static final class Res {
        JSONObject op;
        String why = "";
    }

    private static final int F = Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE;
    private static final String SIGN = "[+\\-−–]";
    private static final String NUM = "[0-9]{1,3}(?:[ \\u00a0][0-9]{3})+(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?";
    private static final String CUR = "₼|AZN|manat|man\\.?|€|EUR|\\$|USD|₽|RUB|£|GBP|₺|TRY";
    // "-12.40 ₼", "+50 AZN", "12,40AZN"
    private static final Pattern AMT_A = Pattern.compile("(" + SIGN + ")?\\s*(" + NUM + ")\\s*(" + CUR + ")(?![\\p{L}])", F);
    // "AZN 12.40", "₼ -12.40"
    private static final Pattern AMT_B = Pattern.compile("(?<![\\p{L}])(" + CUR + ")\\s*(" + SIGN + ")?\\s*(" + NUM + ")", F);
    // "Ödəniş: -0.60" with no currency (the bank's own app only)
    private static final Pattern AMT_C = Pattern.compile(":\\s*(" + SIGN + ")\\s*(" + NUM + ")(?![0-9])");
    private static final Pattern CARD = Pattern.compile("(?:[0-9]{4,6})?[ \\u00a0]*[*xX•·]+[ \\u00a0]*([0-9]{4})(?![0-9])");

    private static final Pattern SKIP = Pattern.compile("uğursuz|ugursuz|ləğv|legv|imtina|rədd|redd|təsdiqlə|tesdiqle|otp|şifrə|sifre|\\bkod\\b|kodu|code|отклон|отмен|неуспеш", F);
    private static final Pattern IN_W = Pattern.compile("mədaxil|medaxil|daxil ol|alındı|alindi|qəbul|qebul|kartınıza|kartiniza|hesabınıza|hesabiniza|geri qaytar|refund|cashback|keşbek|kesbek|artırıldı|artirildi|credit|зачисл|поступ|пополн", F);
    private static final Pattern OUT_W = Pattern.compile("məxaric|mexaric|ödəniş|odenis|alış|alis|çıxarış|cixaris|silindi|tutuldu|nağdlaşdır|nagdlasdir|köçürmə|kocurme|kartınızdan|kartinizdan|hesabınızdan|hesabinizdan|debit|purchase|payment|списан|оплат|покупк|снят", F);
    private static final Pattern NOT_OP_LINE = Pattern.compile("^\\s*(balans|qalıq|qaliq|mövcud|movcud|limit|kart\\s*balans|баланс|остаток)", F);

    static Res read(String title, String body, long when, boolean senderTitle) {
        Res r = new Res();
        try {
            title = title == null ? "" : title.trim();
            body = body == null ? "" : body.trim();
            String all = senderTitle ? body : (title + "\n" + body).trim();
            if (all.isEmpty()) { r.why = "boş bildiriş"; return r; }
            if (SKIP.matcher(all).find()) { r.why = "uğursuz / təsdiq / kod — yazılmır"; return r; }

            // the operation's amount: the first money on a line that is not the balance
            String[] lines = all.split("\n");
            String sign = null, num = null, cur = "", opLine = null;
            long azn = -1;
            for (String line : lines) {
                if (NOT_OP_LINE.matcher(line).find()) continue;
                Matcher a = AMT_A.matcher(line), b = AMT_B.matcher(line);
                boolean fa = a.find(), fb = b.find();
                if (!fa && !fb) continue;
                int at;
                if (fa && (!fb || a.start() <= b.start())) { sign = a.group(1); num = a.group(2); cur = cur(a.group(3)); at = a.end(); }
                else { sign = b.group(2); num = b.group(3); cur = cur(b.group(1)); at = b.end(); }
                opLine = line;
                if ("AZN".equals(cur)) azn = cents(num);
                else {
                    // foreign currency: the manat amount usually follows in brackets "(+3.47₼)"
                    Matcher m2 = AMT_A.matcher(line.substring(at)), m3 = AMT_B.matcher(line.substring(at));
                    while (m2.find()) if ("AZN".equals(cur(m2.group(3)))) { azn = cents(m2.group(2)); break; }
                    if (azn < 0) while (m3.find()) if ("AZN".equals(cur(m3.group(1)))) { azn = cents(m3.group(3)); break; }
                }
                break;
            }
            if (opLine == null) {
                // the bank's own app may leave the currency out: "Ödəniş: -0.60"
                for (String line : lines) {
                    if (NOT_OP_LINE.matcher(line).find()) continue;
                    Matcher c = AMT_C.matcher(line);
                    if (c.find()) { sign = c.group(1); num = c.group(2); cur = "AZN"; azn = cents(num); opLine = line; break; }
                }
            }
            if (opLine == null) { r.why = "məbləğ tapılmadı"; return r; }
            if (azn < 0) { r.why = "manatla məbləğ yoxdur (" + num + " " + cur + ")"; return r; }
            if (azn == 0) { r.why = "məbləğ 0"; return r; }

            boolean in;
            if (sign != null) in = "+".equals(sign);
            else if (IN_W.matcher(all).find()) in = true;
            else if (OUT_W.matcher(all).find()) in = false;
            else { r.why = "gələn, yoxsa çıxan — bilinmədi"; return r; }

            String word = "";
            int colon = opLine.indexOf(':');
            if (colon > 0) {
                String w = opLine.substring(0, colon).replaceAll("^[^\\p{L}\\p{N}]+", "").trim();
                if (w.length() >= 2 && w.length() <= 40 && !w.matches(".*[0-9].*")) word = w;
            }
            if (word.isEmpty() && !senderTitle && !title.isEmpty() && !AMT_A.matcher(title).find() && !AMT_B.matcher(title).find()) word = title;
            if (word.isEmpty()) word = in ? "Mədaxil" : "Məxaric";

            String card = "";
            Matcher c = CARD.matcher(all);
            if (c.find()) card = c.group(1);

            String place = "";
            for (String line : lines) {
                String l = line.trim();
                if (l.isEmpty() || l.equals(opLine.trim()) || NOT_OP_LINE.matcher(l).find()) continue;
                String low = l.toLowerCase(Locale.ROOT);
                if (low.startsWith("kart") || low.startsWith("hesab") || low.startsWith("tarix") || low.startsWith("vaxt")) continue;
                if (AMT_A.matcher(l).find() || AMT_B.matcher(l).find() || CARD.matcher(l).find()) continue;
                if (!senderTitle && l.equals(title)) continue;
                l = l.replaceAll("^(Yer|Məkan|Merchant|Obyekt|Ünvan)\\s*:\\s*", "");
                if (l.length() > 60) l = l.substring(0, 60);
                place = l;
                break;
            }

            Calendar k = Calendar.getInstance();
            k.setTimeInMillis(when);
            JSONObject o = new JSONObject();
            o.put("bank", "ABB");
            o.put("dir", in ? "in" : "out");
            o.put("word", word);
            o.put("amount", azn);
            o.put("orig", num.replace(" ", "").replace(" ", "") + sym(cur));
            o.put("card", card);
            o.put("place", place);
            o.put("date", String.format(Locale.US, "%04d-%02d-%02d", k.get(Calendar.YEAR), k.get(Calendar.MONTH) + 1, k.get(Calendar.DAY_OF_MONTH)));
            o.put("time", String.format(Locale.US, "%02d:%02d", k.get(Calendar.HOUR_OF_DAY), k.get(Calendar.MINUTE)));
            o.put("at", when);
            String h = Integer.toHexString((title + "|" + body).hashCode());
            o.put("key", "abb:" + h + ":" + (when / 60000));
            o.put("sig", "abb:" + h);
            r.op = o;
            r.why = (in ? "gələn " : "çıxan ") + money(azn);
        } catch (Throwable e) {
            r.op = null;
            r.why = "oxuma xətası: " + e.getClass().getSimpleName();
        }
        return r;
    }

    static String money(long q) {
        return (q / 100) + "." + String.format(Locale.US, "%02d", q % 100) + " ₼";
    }

    static String cur(String s) {
        if (s == null) return "";
        String l = s.toLowerCase(Locale.ROOT);
        if (l.equals("₼") || l.equals("azn") || l.startsWith("man")) return "AZN";
        if (l.equals("€") || l.equals("eur")) return "EUR";
        if (l.equals("$") || l.equals("usd")) return "USD";
        if (l.equals("₽") || l.equals("rub")) return "RUB";
        if (l.equals("£") || l.equals("gbp")) return "GBP";
        if (l.equals("₺") || l.equals("try")) return "TRY";
        return s;
    }

    static String sym(String c) {
        switch (c) {
            case "EUR": return "€";
            case "USD": return "$";
            case "RUB": return "₽";
            case "GBP": return "£";
            case "TRY": return "₺";
        }
        return "₼";
    }

    static long cents(String s) {
        s = s.replace(" ", "").replace(" ", "").replace(',', '.');
        return Math.round(Double.parseDouble(s) * 100);
    }
}
