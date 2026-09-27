async function testReddit() {
    try {
        const res = await fetch('https://www.reddit.com/r/futurology/top.json?limit=3&t=day', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AI-Social-Bot/1.0' }
        });
        const data = await res.json();
        const titles = data.data.children.map(c => c.data.title);
        console.log("Trending in Futurology:", titles);
    } catch (e) {
        console.error(e);
    }
}
testReddit();
