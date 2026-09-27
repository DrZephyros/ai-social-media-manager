import { XMLParser } from "fast-xml-parser";

async function testTrends() {
    try {
        const res = await fetch('https://trends.google.com/trends/trendingsearches/daily/rss?geo=US');
        const text = await res.text();
        console.log("Trends text starts with:", text.substring(0, 100));
    } catch (e) {
        console.error(e);
    }
}
testTrends();
