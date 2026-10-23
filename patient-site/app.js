let cfg,sb,user,profile,map,markers=[];let signup=false;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const UI_STATE_KEY='medilink_ui_state_v5';
function readUIState(){
  try{return JSON.parse(localStorage.getItem(UI_STATE_KEY)||'{}')}catch{return{}}
}
function writeUIState(patch={}){
  const next={...readUIState(),...patch,updatedAt:Date.now()};
  localStorage.setItem(UI_STATE_KEY,JSON.stringify(next));
  return next;
}
function currentView(){return document.querySelector('.view:not(.hidden)')?.id||readUIState().view||'home'}
function persistVisibleState(){
  const state={view:currentView()};
  const q=$('#doctorQuery');
  if(q)state.doctorSearch={
    zone:q.dataset.zone||q.value||'',query:q.value||'',specialty:$('#specialty')?.value||'',
    other:$('#otherSpecialty')?.value||'',radius:$('#doctorRadius')?.value||'10',
    lat:window.lastCoords?.lat??readUIState().doctorSearch?.lat??null,
    lng:window.lastCoords?.lng??readUIState().doctorSearch?.lng??null,
    message:$('#doctorMsg')?.textContent||'',results:window.doctors||readUIState().doctorSearch?.results||[]
  };
  writeUIState(state);
}
async function start(){
  cfg=await fetch('./config.json',{cache:'no-store'}).then(r=>r.json());
  if(cfg.supabaseAnonKey.startsWith('REMPLACER')){
    $('#authMsg').textContent='Configurez la clé Supabase anon dans config.json.';
    return;
  }
  sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const {data:{session}}=await sb.auth.getSession();
  if(session) await enter(session.user,false);
  else leave(false);

  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='SIGNED_OUT' || !session){leave(false);return;}
    if(event==='SIGNED_IN' && (!user || user.id!==session.user.id)){
      await enter(session.user,false);
    }
    // TOKEN_REFRESHED, USER_UPDATED et retour sur l'onglet : aucune navigation.
  });
}
$('#switchAuth').onclick=()=>{signup=!signup;$('#authTitle').textContent=signup?'Créer mon compte':'Connexion patient';$('#switchAuth').textContent=signup?'J’ai déjà un compte':'Créer un compte';$('#nameWrap').classList.toggle('hidden',!signup)};
$('#authForm').onsubmit=async e=>{e.preventDefault();let email=$('#email').value.trim(),password=$('#password').value;$('#authMsg').textContent='Veuillez patienter…';let res;if(signup){res=await sb.auth.signUp({email,password,options:{emailRedirectTo:cfg.authRedirectUrl,data:{full_name:$('#fullName').value.trim(),role:'patient'}}});if(res.error){const m=(res.error.message||'').toLowerCase();$('#authMsg').textContent=m.includes('already')||m.includes('registered')||m.includes('exists')?'Désolé, ce compte est déjà inscrit. Connectez-vous ou réinitialisez votre mot de passe.':res.error.message;return}if(res.data?.user&&Array.isArray(res.data.user.identities)&&res.data.user.identities.length===0){$('#authMsg').textContent='Désolé, ce compte est déjà inscrit. Connectez-vous ou réinitialisez votre mot de passe.';return}$('#authMsg').textContent='Compte créé. Un e-mail de confirmation vient de vous être envoyé. Vérifiez aussi vos courriers indésirables.'}else{res=await sb.auth.signInWithPassword({email,password});$('#authMsg').textContent=res.error?res.error.message:'Connexion réussie.'}};
async function enter(u,forceHome=false){
  user=u;
  const {data:account,error:roleError}=await sb.from('profiles').select('role').eq('id',u.id).maybeSingle();
  if(roleError||!account){
    await sb.auth.signOut();
    $('#authMsg').textContent='Profil utilisateur introuvable. Contactez le support MediLink.';
    return;
  }
  if(account.role!=='patient'){
    await sb.auth.signOut();
    $('#authMsg').textContent='Ce compte est un compte médecin. Utilisez le logiciel MediLink Médecin.';
    return;
  }
  $('#auth').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#logout').classList.remove('hidden');
  await loadProfile();
  const saved=readUIState();const routeFromHash=(location.hash||'').replace('#/','').replace('#','');const target=forceHome?'home':(routeFromHash||saved.view||'home');show(document.getElementById(target)?target:'home',false);restoreExactUIState();
}
function leave(clearPage=true){
  user=null;profile=null;
  $('#auth').classList.remove('hidden');
  $('#app').classList.add('hidden');
  $('#logout').classList.add('hidden');
  if(clearPage)localStorage.removeItem('medilink_active_view');
}
$('#logout').onclick=async()=>{localStorage.removeItem('medilink_active_view');localStorage.removeItem('medilink_doctor_search');localStorage.removeItem('medilink_doctor_results');localStorage.removeItem(UI_STATE_KEY);history.replaceState(null,'',location.pathname+location.search);await sb.auth.signOut()};
async function loadProfile(){
  $('#patientId').textContent='Création…';let data=null,error=null;
  const ensured=await sb.rpc('ensure_my_patient_profile');
  if(!ensured.error&&ensured.data?.length)data=ensured.data[0];
  else{const direct=await sb.from('patient_profiles').select('*').eq('user_id',user.id).maybeSingle();data=direct.data;error=direct.error||ensured.error}
  if(!data){profile=null;$('#patientId').textContent='ID indisponible';console.error(error);return}
  profile=data;$('#patientId').textContent=profile.patient_code||'ID indisponible';
  $('#welcome').textContent='Bonjour '+(profile.full_name||'');
  const f=$('#recordForm');Object.keys(profile).forEach(k=>{if(f.elements[k])f.elements[k].value=profile[k]||''});
  $('#profileStatus').textContent=profile.birth_date?'Fiche renseignée':'À compléter';
  loadDocs();loadDoctors();loadAccess();
}
function saveDoctorSearchState(){
  const state={zone:$('#doctorQuery').dataset.zone||$('#doctorQuery').value||'',q:$('#doctorQuery').value||'',specialty:$('#specialty').value||'',other:$('#otherSpecialty').value||'',radius:$('#doctorRadius').value||'10',lat:window.lastCoords?.lat??null,lng:window.lastCoords?.lng??null,message:$('#doctorMsg').textContent||''};
  localStorage.setItem('medilink_doctor_search',JSON.stringify(state));
}
function cacheDoctorResults(){
  const safe=(window.doctors||[]).slice(0,80).map(d=>({id:d.id||null,display_name:d.display_name||'',specialty:d.specialty||'',city:d.city||'',address:d.address||'',latitude:d.latitude??null,longitude:d.longitude??null,distance:d.distance??null,registered:!!d.registered}));
  localStorage.setItem('medilink_doctor_results',JSON.stringify(safe));
}
function restoreDoctorSearch(){
  try{
    const state=JSON.parse(localStorage.getItem('medilink_doctor_search')||'null');
    const cached=JSON.parse(localStorage.getItem('medilink_doctor_results')||'[]');
    if(state){
      $('#doctorQuery').value=state.q||state.zone||'';
      $('#doctorQuery').dataset.zone=state.zone||'';
      $('#specialty').value=state.specialty||'';
      $('#otherSpecialty').value=state.other||'';
      $('#doctorRadius').value=state.radius||'10';
      $('#otherSpecialty').classList.toggle('hidden',$('#specialty').value!=='Autre');
      if(Number.isFinite(+state.lat)&&Number.isFinite(+state.lng))window.lastCoords={lat:+state.lat,lng:+state.lng};
    }
    if(cached.length){window.doctors=cached;renderDoctors();$('#doctorMsg').textContent=state?.message||cached.length+' résultat(s) restauré(s).';}
  }catch(error){console.warn('Restauration recherche impossible',error)}
}
window.addEventListener('hashchange',()=>{if(!user)return;const id=(location.hash||'').replace('#/','').replace('#','');if(id)show(id,false)});
function restoreExactUIState(){
  const state=readUIState(),d=state.doctorSearch;
  if(!d)return;
  $('#doctorQuery').value=d.query||d.zone||'';$('#doctorQuery').dataset.zone=d.zone||'';
  $('#specialty').value=d.specialty||'';$('#otherSpecialty').value=d.other||'';
  $('#doctorRadius').value=d.radius||'10';
  $('#otherSpecialty').classList.toggle('hidden',$('#specialty').value!=='Autre');
  if(Number.isFinite(+d.lat)&&Number.isFinite(+d.lng))window.lastCoords={lat:+d.lat,lng:+d.lng};
  if(Array.isArray(d.results)&&d.results.length){window.doctors=d.results;renderDoctors()}
  if(d.message)$('#doctorMsg').textContent=d.message;
}
window.addEventListener('pagehide',persistVisibleState);
window.addEventListener('beforeunload',persistVisibleState);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persistVisibleState();else if(user){const wanted=readUIState().view||currentView();show(wanted,false);restoreExactUIState()}});
window.addEventListener('pageshow',()=>{if(user){const wanted=readUIState().view||'home';show(wanted,false);restoreExactUIState()}});
function show(id,remember=true){
  if(!document.getElementById(id))id='home';
  $$('.view').forEach(v=>v.classList.toggle('hidden',v.id!==id));
  if(remember){
    writeUIState({view:id});
    history.replaceState({view:id},'',location.pathname+location.search+'#/'+id);
  }
  if(id==='doctors')setTimeout(()=>{initMap();map?.invalidateSize();restoreExactUIState()},70);
}
$$('[data-view]').forEach(b=>{b.type='button';b.onclick=e=>{e.preventDefault();persistVisibleState();show(b.dataset.view,true)}});$$('[data-go]').forEach(b=>{b.type='button';b.onclick=e=>{e.preventDefault();persistVisibleState();show(b.dataset.go,true)}});
$('#copyId').onclick=async()=>{const id=$('#patientId').textContent;if(!id.startsWith('MLT-'))return alert('ID patient non disponible. Rechargez la page après avoir exécuté le correctif SQL.');await navigator.clipboard.writeText(id);$('#copyId').textContent='Copié ✓';setTimeout(()=>$('#copyId').textContent='Copier',1400)};
$('#recordForm').onsubmit=async e=>{e.preventDefault();let values=Object.fromEntries(new FormData(e.target));values.updated_at=new Date().toISOString();let {error}=await sb.from('patient_profiles').update(values).eq('user_id',user.id);$('#recordMsg').textContent=error?error.message:'Fiche enregistrée.';if(!error)loadProfile()};
$('#docForm').onsubmit=async e=>{e.preventDefault();let file=$('#docFile').files[0];if(!file||file.size>10*1024*1024)return alert('Fichier invalide ou supérieur à 10 Mo');let path=`${user.id}/${crypto.randomUUID()}-${file.name}`;let up=await sb.storage.from('medical-documents').upload(path,file);if(up.error)return alert(up.error.message);let ins=await sb.from('medical_documents').insert({patient_id:profile.id,document_type:$('#docType').value,file_name:file.name,storage_path:path});if(ins.error)alert(ins.error.message);else{e.target.reset();loadDocs()}};
async function loadDocs(){if(!profile)return;let {data=[]}=await sb.from('medical_documents').select('*').eq('patient_id',profile.id).order('created_at',{ascending:false});$('#docCount').textContent=data.length+' fichier(s)';$('#docsList').innerHTML=data.map(d=>`<div class="item"><h3>${esc(d.document_type)}</h3><p>${esc(d.file_name)}</p><div class="itemfooter"><span>${new Date(d.created_at).toLocaleDateString('fr-FR')}</span><button onclick="openDoc('${d.storage_path}')">Ouvrir</button></div></div>`).join('')||'<div class="item">Aucun document.</div>'}
window.openDoc=async p=>{let {data,error}=await sb.storage.from('medical-documents').createSignedUrl(p,60);if(error)alert(error.message);else window.open(data.signedUrl,'_blank','noopener')};
async function loadDoctors(){let {data=[]}=await sb.from('doctor_profiles').select('id,display_name,specialty,city,address,latitude,longitude').eq('verification_status','verified');window.registeredDoctors=data;window.doctors=data.map(d=>({...d,registered:true}));renderDoctors()}
async function fetchJson(url,opt={}){const c=new AbortController(),timer=setTimeout(()=>c.abort(),12000);try{let r=await fetch(url,{...opt,signal:c.signal});if(!r.ok)throw Error('HTTP '+r.status);return await r.json()}finally{clearTimeout(timer)}}
function km(a,b,c,d){const R=6371,p=Math.PI/180,x=(c-a)*p,y=(d-b)*p,z=Math.sin(x/2)**2+Math.cos(a*p)*Math.cos(c*p)*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(z))}
async function geocodeZone(q){try{let d=await fetchJson('/api/geocode?q='+encodeURIComponent(q));if(d.results?.length)return d.results[0]}catch(e){}let d=await fetchJson('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tn&q='+encodeURIComponent(q+', Tunisie'));if(!d.length)throw Error('Zone introuvable');return{lat:+d[0].lat,lon:+d[0].lon}}
async function overpass(query){try{return await fetchJson('/api/overpass',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query})})}catch(e){for(const u of ['https://overpass.private.coffee/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter'])try{return await fetchJson(u,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query)})}catch(x){}throw Error('Recherche des médecins indisponible')}}
async function searchNearby(lat,lng,isRestore=false){window.lastCoords={lat,lng};saveDoctorSearchState();initMap();let radius=Number($('#doctorRadius').value||10),meters=radius*1000;$('#doctorMsg').textContent=isRestore?'Restauration de votre dernière recherche…':'Recherche des médecins et cabinets autour de cette position…';$('#searchZone').disabled=true;$('#locate').disabled=true;try{let q=`[out:json][timeout:25];(nwr["amenity"="doctors"](around:${meters},${lat},${lng});nwr["healthcare"="doctor"](around:${meters},${lat},${lng});nwr["healthcare:speciality"](around:${meters},${lat},${lng}););out center tags;`;let osm=await overpass(q),seen=new Set();let external=(osm.elements||[]).map(e=>{let t=e.tags||{},la=+(e.lat??e.center?.lat),lo=+(e.lon??e.center?.lon);return{id:null,display_name:t.name||t['name:fr']||'Cabinet médical',specialty:t['healthcare:speciality']||t.speciality||'Médecin / cabinet',city:t['addr:city']||'',address:t['addr:full']||[t['addr:housenumber'],t['addr:street'],t['addr:suburb']].filter(Boolean).join(' '),latitude:la,longitude:lo,distance:km(lat,lng,la,lo),registered:false}}).filter(d=>Number.isFinite(d.latitude)&&!seen.has(d.latitude+':'+d.longitude)&&(seen.add(d.latitude+':'+d.longitude),true));let registered=(window.registeredDoctors||[]).map(d=>({...d,registered:true,distance:d.latitude?km(lat,lng,+d.latitude,+d.longitude):null}));window.doctors=[...registered,...external].sort((a,b)=>(a.distance??999)-(b.distance??999)).slice(0,60);map.setView([lat,lng],13);if(window.userMarker)window.userMarker.remove();window.userMarker=L.circleMarker([lat,lng],{radius:8,color:'#2563eb',fillOpacity:.9}).addTo(map).bindPopup('Votre position approximative').openPopup();$('#doctorMsg').textContent=window.doctors.length+' résultat(s) trouvés dans un rayon de '+radius+' km.';renderDoctors();saveDoctorSearchState();cacheDoctorResults();persistVisibleState()}catch(e){console.error(e);window.doctors=(window.registeredDoctors||[]).map(d=>({...d,registered:true}));renderDoctors();$('#doctorMsg').textContent='La recherche cartographique prend trop de temps ou est indisponible. Réessayez, augmentez le rayon ou utilisez « Autour de moi ».'}finally{$('#searchZone').disabled=false;$('#locate').disabled=false}}
function renderDoctors(){
  const q=($('#doctorQuery').value===($('#doctorQuery').dataset.zone||'')?'':$('#doctorQuery').value.toLowerCase());
  const sp=$('#specialty').value==='Autre'?$('#otherSpecialty').value.trim():$('#specialty').value;
  const aliases={
    'Médecine générale':['médecine générale','medecine generale','general','general practitioner','family','médecin / cabinet','doctor'],
    'Cardiologie':['cardio','cardiology','cardiovascular'],
    'Gynécologie':['gyn','gyne','obstetric'],
    'Pédiatrie':['pédia','pedia','paediatric'],
    'Dermatologie':['derma'],
    'Ophtalmologie':['opht','ophthal'],
    'Psychiatrie':['psychiatr']
  };
  const keys=sp?(aliases[sp]||[sp.toLowerCase()]):[];
  const source=window.doctors||[];
  const textMatch=d=>{const text=`${d.display_name} ${d.specialty} ${d.city} ${d.address}`.toLowerCase();return !q||text.includes(q)};
  const specialtyMatch=d=>{if(!sp)return true;const text=`${d.display_name} ${d.specialty}`.toLowerCase();return keys.some(k=>text.includes(k))};
  let ds=source.filter(d=>textMatch(d)&&specialtyMatch(d));
  let fallback=false;
  if(sp&&!ds.length){ds=source.filter(textMatch);fallback=ds.length>0}

  $('#doctorList').innerHTML=ds.map((d,index)=>{
    const speciality=fallback&&!specialtyMatch(d)?'Spécialité non renseignée':(d.specialty||'Médecin / cabinet');
    const location=[d.address,d.city].filter(Boolean).join(' · ')||'Coordonnées cartographiques disponibles';
    const distance=d.distance!=null?`${d.distance.toFixed(1)} km`:'Distance non calculée';
    return `<article class="health-result-card" data-doctor-index="${index}">
      <div class="health-card-tags">
        <span class="health-type">${esc(sp||'Médecin')}</span>
        <span class="health-status">${d.registered?'Professionnel vérifié':'Source cartographique'}</span>
      </div>
      <h3>${esc(d.display_name||'Cabinet médical')}</h3>
      <p class="health-specialty">${esc(speciality)}</p>
      <p class="health-address"><span>📍</span>${esc(location)}</p>
      <strong class="health-distance">${distance}</strong>
      <div class="health-actions">
        <a class="route-action" href="https://www.google.com/maps/dir/?api=1&destination=${d.latitude},${d.longitude}" target="_blank" rel="noopener">Itinéraire →</a>
        ${d.registered?`<button class="share-action" onclick="requestAccess('${d.id}')">Partager mon dossier</button>`:`<button class="map-action" type="button" data-focus-index="${index}">Voir sur la carte</button>`}
      </div>
    </article>`
  }).join('')||'<div class="health-empty"><b>Aucun établissement trouvé</b><p>Essayez une autre zone, une autre spécialité ou augmentez le rayon.</p></div>';

  if(map){
    markers.forEach(m=>m.remove());markers=[];
    markers=ds.filter(d=>Number.isFinite(+d.latitude)&&Number.isFinite(+d.longitude)).map(d=>{
      const speciality=fallback&&!specialtyMatch(d)?'Spécialité non renseignée':(d.specialty||'Médecin / cabinet');
      const icon=L.divIcon({className:'health-pin-wrap',html:'<div class="health-pin">✚</div>',iconSize:[34,42],iconAnchor:[17,42]});
      return L.marker([+d.latitude,+d.longitude],{icon}).addTo(map).bindPopup(`<div class="map-popup"><b>${esc(d.display_name||'Cabinet médical')}</b><span>${esc(speciality)}</span><small>${d.distance!=null?d.distance.toFixed(1)+' km':''}</small></div>`)
    });
    if(markers.length)map.fitBounds(markers.map(m=>m.getLatLng()),{padding:[35,35],maxZoom:14});
  }

  document.querySelectorAll('[data-focus-index]').forEach(button=>button.onclick=()=>{
    const d=ds[Number(button.dataset.focusIndex)];
    if(!d||!map)return;
    map.setView([+d.latitude,+d.longitude],16);
    const marker=markers.find(m=>Math.abs(m.getLatLng().lat-(+d.latitude))<0.000001&&Math.abs(m.getLatLng().lng-(+d.longitude))<0.000001);
    marker?.openPopup();
    document.getElementById('map').scrollIntoView({behavior:'smooth',block:'center'});
  });

  if(fallback)$('#doctorMsg').innerHTML=`<b>${ds.length} établissement(s)</b> trouvé(s) dans la zone. La spécialité « ${esc(sp)} » n’est pas renseignée pour tous les résultats.`;
  else $('#doctorMsg').innerHTML=ds.length?`<b>${ds.length} résultat(s)</b> affiché(s)${sp?' pour « '+esc(sp)+' »':''}.`:'Aucun résultat trouvé.';
}
['doctorQuery','otherSpecialty'].forEach(id=>$('#'+id).oninput=()=>{saveDoctorSearchState();renderDoctors();persistVisibleState()});$('#specialty').onchange=e=>{$('#otherSpecialty').classList.toggle('hidden',e.target.value!=='Autre');saveDoctorSearchState();if(window.lastCoords)searchNearby(window.lastCoords.lat,window.lastCoords.lng);else{renderDoctors();persistVisibleState()}};
function initMap(){if(map){map.invalidateSize();return}map=L.map('map').setView([cfg.map.defaultLat,cfg.map.defaultLng],cfg.map.defaultZoom);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);renderDoctors()}
$('#locate').onclick=()=>{if(!navigator.geolocation)return $('#doctorMsg').textContent='La géolocalisation n’est pas disponible.';$('#doctorMsg').textContent='Autorisez la localisation dans votre navigateur…';navigator.geolocation.getCurrentPosition(p=>searchNearby(p.coords.latitude,p.coords.longitude),e=>$('#doctorMsg').textContent=e.code===1?'Localisation refusée. Autorisez-la dans les réglages du navigateur ou saisissez une zone.':'Position indisponible. Saisissez une zone.',{enableHighAccuracy:true,timeout:12000,maximumAge:60000})};
$('#searchZone').onclick=async()=>{let q=$('#doctorQuery').value.trim();if(q.length<2)return $('#doctorMsg').textContent='Saisissez une ville ou une zone dans le premier champ.';try{$('#doctorMsg').textContent='Localisation de la zone…';let g=await geocodeZone(q);$('#doctorQuery').dataset.zone=q;$('#doctorQuery').value=q;saveDoctorSearchState();searchNearby(+g.lat,+g.lon)}catch(e){$('#doctorMsg').textContent=e.message}};
$('#doctorRadius').onchange=()=>{saveDoctorSearchState();if(window.lastCoords)searchNearby(window.lastCoords.lat,window.lastCoords.lng)};
window.requestAccess=async doctorId=>{let {error}=await sb.from('patient_doctor_permissions').upsert({patient_id:profile.id,doctor_id:doctorId,status:'active',expires_at:new Date(Date.now()+7*86400000).toISOString()},{onConflict:'patient_id,doctor_id'});alert(error?error.message:'Accès accordé pour 7 jours. Vous pouvez le révoquer à tout moment.');loadAccess()};
async function loadAccess(){if(!profile)return;let {data=[]}=await sb.from('patient_doctor_permissions').select('id,status,expires_at,doctor_profiles(display_name,specialty)').eq('patient_id',profile.id).order('created_at',{ascending:false});$('#accessCount').textContent=data.filter(x=>x.status==='active').length+' médecin(s)';$('#accessList').innerHTML=data.map(a=>`<div class="item"><h3>${esc(a.doctor_profiles?.display_name||'Médecin')}</h3><p>${esc(a.doctor_profiles?.specialty||'')} · ${esc(a.status)}</p><div class="itemfooter"><span>Expire : ${a.expires_at?new Date(a.expires_at).toLocaleDateString('fr-FR'):'—'}</span>${a.status==='active'?`<button onclick="revoke('${a.id}')">Révoquer</button>`:''}</div></div>`).join('')||'<div class="item">Aucun accès accordé.</div>'}
window.revoke=async id=>{await sb.from('patient_doctor_permissions').update({status:'revoked',revoked_at:new Date().toISOString()}).eq('id',id);loadAccess()};function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}$('#resendConfirmation').onclick=async()=>{const email=$('#email').value.trim();if(!email)return $('#authMsg').textContent='Saisissez d’abord votre adresse e-mail.';$('#authMsg').textContent='Envoi en cours…';const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:cfg.authRedirectUrl}});$('#authMsg').textContent=error?error.message:'Si ce compte attend une confirmation, un nouvel e-mail vient d’être envoyé. Vérifiez aussi les spams.';};
start();