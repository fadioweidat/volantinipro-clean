import fs from 'fs';

const overpassUrl = "https://lz4.overpass-api.de/api/interpreter";
const query = `
[out:json][timeout:60];
node["name"="Milano"]["place"="city"];
relation(around:15000)["boundary"="postal_code"];
out geom;
`;

async function fetchCaps() {
  console.log("Fetching postal codes from Overpass...");
  const res = await fetch(overpassUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Node.js/Fetch",
      "Accept": "application/json"
    },
    body: "data=" + encodeURIComponent(query)
  });
  if (!res.ok) {
    console.error("Failed to fetch:", res.statusText, await res.text());
    return;
  }
  const data = await res.json();
  fs.writeFileSync('milano_caps.json', JSON.stringify(data));
  console.log("Saved to milano_caps.json. Elements:", data.elements?.length);
}
fetchCaps();
