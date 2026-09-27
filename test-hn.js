async function testHN() {
    try {
        const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        const ids = await topRes.json();
        const top5 = ids.slice(0, 5);
        const titles = [];
        for (const id of top5) {
            const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
            const item = await itemRes.json();
            titles.push(item.title);
        }
        console.log("Trending on HN:", titles);
    } catch (e) {
        console.error(e);
    }
}
testHN();
