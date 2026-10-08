// Browser-only zero-write harness. Imports real Step3/Step4; injected read transport.
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Step3} from '../../src/pages/public/configurator/Step3.jsx';
import {Step4} from '../../src/pages/public/configurator/Step4.jsx';
const city={name:'Milano',lat:45.46,lng:9.19};
const seed=window.__PAIRING_SEED || {type:'d2d',subscription:'single',qty:5959,flyerQuantity:5959,hasFlyers:'yes',alreadyPrinted:true,printing:{enabled:false},urgency:'normal',cityName:'Milano',city,selectedComuni:[city],campaignZones:[{id:'pv1',searchMode:'municipality',city,cityName:'Milano',selectedComuni:[city],readyForQuote:true,finalFlyers:5959,assigned_flyers:5959,nilManualMode:true,allocation:[{name:'ISOLA',nil_code:'9',assignedFlyers:5959,requiredFlyers:5959}],kpiSnapshot:{families:5417,population:10000,requiredFlyers:5959,analysisLevel:'nil'}}]};
window.__PAIRING_REQUESTS=[];
const attempts={};
const request=async(body,{pvId,signal})=>{
 window.__PAIRING_REQUESTS.push({pvId,body,signal});attempts[pvId]=(attempts[pvId]||0)+1;
 await new Promise(r=>setTimeout(r,window.__PAIRING_DELAYS?.[pvId] || 80));
 if(window.__PAIRING_FAILURE===pvId&&attempts[pvId]===1)throw Error('MOCK_READ_API_ERROR');
 const date=new Date(Date.parse(body.startDate)+5*86400000).toISOString().slice(0,10);
 const second=new Date(Date.parse(body.startDate)+6*86400000).toISOString().slice(0,10);
 return {source:'campaign_capacity',availableDates:[{date,placesAvailable:2},{date:second,placesAvailable:2}],smartPairingSlots:[{date,type:'same',discountPercent:40,placesAvailable:2,source:'campaign_capacity'}]};
};
function Harness(){
 const [data,setData]=useState(()=>JSON.parse(localStorage.getItem('pairing-test-draft') || 'null') || seed);
 const [step,setStep]=useState(3);
 useEffect(()=>{window.__PAIRING_STATE=data;localStorage.setItem('pairing-test-draft',JSON.stringify(data));history.replaceState({data,step},'');},[data,step]);
 useEffect(()=>{const pop=e=>{if(e.state?.data)setData(e.state.data);if(e.state?.step)setStep(e.state.step);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const next=()=>{history.pushState({data,step:4},'');setStep(4);};
 return <><div style={{display:'flex',flexWrap:'wrap',gap:8}}>
 <button id="delete-pv" onClick={()=>setData(d=>({...d,campaignZones:d.campaignZones.slice(0,-1)}))}>Delete last PV</button>
 <button id="reorder-pvs" onClick={()=>setData(d=>({...d,campaignZones:[...d.campaignZones].reverse()}))}>Reorder</button>
 <button id="change-territory" onClick={()=>setData(d=>({...d,campaignZones:d.campaignZones.map((z,i)=>i===0?{...z,city:{...z.city,lat:45.6}}:z)}))}>Change territory</button>
 <button id="change-period" onClick={()=>setData(d=>({...d,startDate:new Date(Date.parse(d.startDate || new Date().toISOString().slice(0,10))+86400000).toISOString().slice(0,10)}))}>Change period</button>
 <button id="step3" onClick={()=>setStep(3)}>Step3</button></div>
 {step===3?<Step3 data={data} setData={setData} onNext={next} onBack={()=>{}} availabilityRequest={request}/>:<Step4 data={data} setData={setData} onBack={()=>setStep(3)} onHome={()=>{}}/>}</>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
