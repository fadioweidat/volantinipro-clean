import React, { useState } from 'react';
import { supabase } from '../../../supabaseClient.js';
export default function FeasibilityAuth({ onSuccess }) {
 const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 async function submit(event) {
   event.preventDefault(); setBusy(true); setNotice('');
   const values=new FormData(event.currentTarget), email=String(values.get('email')).trim(), password=String(values.get('password'));
   try {
     const {data,error}=register ? await supabase.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}/le-mie-analisi`}}) : await supabase.auth.signInWithPassword({email,password});
     if(error) throw error;
     if(data.session) { localStorage.setItem('vp_supabase_session',JSON.stringify({accessToken:data.session.access_token,refreshToken:data.session.refresh_token,user:data.user})); await onSuccess(); } else setNotice('Controlla la tua email per confermare la registrazione, poi accedi qui. La tua analisi resta in questa scheda.');
   } catch { setNotice('Accesso non completato. Verifica le credenziali e la conferma email.'); }
   finally { setBusy(false); }
 }
 return <section className="vf-panel"><h2>{register?'Crea un account cliente':'Accedi per continuare'}</h2><p>L’analisi gratuita resta disponibile. Acquisto e report sono associati al tuo account verificato.</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" minLength={8} autoComplete={register?'new-password':'current-password'} required /></label><button className="vf-primary" disabled={busy}>{register?'Registrati':'Accedi'}</button><button type="button" disabled={busy} onClick={()=>setRegister(!register)}>{register?'Ho già un account':'Crea account'}</button></form>{notice&&<p role="status">{notice}</p>}</section>;
}
