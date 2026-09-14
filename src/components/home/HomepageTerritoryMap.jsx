import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { HERO_SCENARIO, formatHeroMetric } from './homepageHeroData.js';

export default function HomepageTerritoryMap({ groups, selected, onSelect, loading, unavailable, missingGeometries }) {
  const host=useRef(null), mapRef=useRef(null), territories=useRef(null), radiusLayer=useRef(null);
  const [boundaries,setBoundaries]=useState(true), [radiusVisible,setRadiusVisible]=useState(true), [tilesFailed,setTilesFailed]=useState(false);
  const reset=()=>{const map=mapRef.current;if(map)map.fitBounds(L.latLng(HERO_SCENARIO.lat,HERO_SCENARIO.lng).toBounds(HERO_SCENARIO.radiusKm*2000),{padding:[60,70],maxZoom:12.5,animate:false});};
  useEffect(()=>{
    const map=L.map(host.current,{zoomControl:false,scrollWheelZoom:false,attributionControl:true,minZoom:9,maxZoom:17,zoomSnap:.25,zoomDelta:.5});mapRef.current=map;
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(map);
    tiles.on('tileerror',()=>setTilesFailed(true)); tiles.on('tileload',()=>setTilesFailed(false));
    L.control.zoom({position:'topright'}).addTo(map);
    radiusLayer.current=L.circle([HERO_SCENARIO.lat,HERO_SCENARIO.lng],{radius:HERO_SCENARIO.radiusKm*1000,color:'#ff7b36',weight:2.5,dashArray:'7 5',fillColor:'#f36e23',fillOpacity:.08,className:'vph-radius',interactive:false}).addTo(map);
    L.circleMarker([HERO_SCENARIO.lat,HERO_SCENARIO.lng],{radius:8,color:'#ff8a41',weight:4,fillColor:'#fff0d9',fillOpacity:1,className:'vph-center',interactive:false}).addTo(map);
    territories.current=L.layerGroup().addTo(map);reset();
    const observer=new ResizeObserver(()=>{map.invalidateSize({pan:false});reset();});observer.observe(host.current);
    return()=>{observer.disconnect();map.remove();mapRef.current=null;territories.current=null;};
  },[]);
  useEffect(()=>{
    const layer=territories.current;if(!layer)return;layer.clearLayers();if(!boundaries)return;
    groups.forEach(group=>{
      const geo=L.geoJSON({type:'FeatureCollection',features:group.features},{style:{color:group.color,weight:selected===group.id?3:1.6,fillColor:group.color,fillOpacity:selected && selected !== group.id ? .10 : .20,className:'vph-territory'}}).addTo(layer);
      geo.eachLayer(part=>part.getElement()?.style.setProperty('color',group.color));
      if(!geo.getBounds().isValid())return;
      const label=document.createElement('span');label.textContent=group.name;
      geo.bindTooltip(label,{permanent:true,direction:'center',className:'vph-map-label',opacity:1});
      const popup=document.createElement('div');const title=document.createElement('strong');title.textContent=group.name;popup.append(title,document.createElement('br'),document.createTextNode(`${formatHeroMetric(group.families)} famiglie stimate nel raggio${group.isNil?' · NIL analizzati':''}`));geo.bindPopup(popup);
      geo.on('click',()=>onSelect(group.id));
    });
    radiusLayer.current?.bringToFront();
  },[groups,boundaries,selected,onSelect]);
  useEffect(()=>{const map=mapRef.current,radius=radiusLayer.current;if(!map||!radius)return;if(radiusVisible)radius.addTo(map);else map.removeLayer(radius);},[radiusVisible]);
  return <div className="vph-map-frame" role="region" aria-label="Mappa interattiva: Cormano e territori nel raggio di 3 chilometri">
    <div className="vph-map" ref={host} />
    <div className="vph-map-context"><span className="vph-live-dot" />Scenario reale · Cormano · 3 km</div>
    {(loading||unavailable||missingGeometries>0||tilesFailed)&&<div className="vph-map-status" role="status">{loading?'Caricamento analisi territoriale…':unavailable?'Analisi non disponibile. La mappa resta esplorabile.':tilesFailed?'Sfondo cartografico temporaneamente non disponibile.':`${missingGeometries} confini non disponibili nella fonte.`}</div>}
    <div className="vph-map-controls"><button type="button" onClick={()=>{onSelect(null);reset();}} aria-label="Ripristina vista Cormano">↗ <span>Centra mappa</span></button><label><input type="checkbox" checked={boundaries} onChange={e=>setBoundaries(e.target.checked)} />Confini territoriali</label><label><input type="checkbox" checked={radiusVisible} onChange={e=>setRadiusVisible(e.target.checked)} />Raggio di analisi</label></div>
  </div>;
}
