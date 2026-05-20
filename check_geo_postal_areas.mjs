import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log("Checking geo_postal_areas...");
  const { data, error } = await supabase.from('geo_postal_areas').select('*').eq('municipality_name', 'Milano');
  if (error) {
    console.error("Error querying geo_postal_areas:", error);
  } else {
    console.log("Found rows:", data.length);
    if (data.length > 0) {
      console.log("Sample columns:", Object.keys(data[0]));
      console.log("Sample capabilities (1st row):", { 
        cap: data[0].postal_code, 
        area: data[0].area_km2,
        has_geom: !!data[0].geom || !!data[0].geometry,
        families: data[0].households_estimated || data[0].households,
        pop: data[0].population_estimated || data[0].population
      });
      console.log("All CAPs:", data.map(d => d.postal_code).sort().join(', '));
    }
  }
}
check();
