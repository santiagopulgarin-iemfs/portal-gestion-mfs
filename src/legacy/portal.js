// @ts-nocheck
/* Lógica original del Portal (artefacto v21), sin cambios salvo este envoltorio. Usa window.claude (ver src/lib/claudeShim.ts). */
let started=false;
export function initPortal(){
if(started)return;started=true;
"use strict";
var LS_KEY="tablero-proyectos-v1";
function vacio(){return {institucion:"",anioActual:"2024",anioProximo:"2025",docentes:[],proyectos:[],esEjemplo:false};}
function normalizar(d){
  var s=vacio(); d=d||{};
  s.institucion=typeof d.institucion==="string"?d.institucion:"";
  s.anioActual=String(d.anioActual||"2024"); s.anioProximo=String(d.anioProximo||"2025");
  s.esEjemplo=!!d.esEjemplo;
  s.docentes=(Array.isArray(d.docentes)?d.docentes:[]).filter(function(x){return x&&x.id;}).map(function(x){return {id:String(x.id),nombre:String(x.nombre||"")};});
  var ids={}; s.docentes.forEach(function(x){ids[x.id]=1;});
  s.proyectos=(Array.isArray(d.proyectos)?d.proyectos:[]).filter(function(x){return x&&x.id;}).map(function(p){
    var f=function(a){return (Array.isArray(a)?a:[]).map(String).filter(function(i,k,arr){return ids[i]&&arr.indexOf(i)===k;});};
    return {id:String(p.id),nombre:String(p.nombre||""),actual:f(p.actual),proximo:f(p.proximo)};
  });
  return s;
}
var state=vacio();
var ui={sel:null,adding:null,confirm:null,msg:null,copyText:null,focus:null};
var db=null,docRef=null,downloads=null,mode="wait",dirty=false,saving=false,timer=null,lastJson="",pendingRemote=null,canWrite=null;

function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function uid(p){return p+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3);}
function $(id){return document.getElementById(id);}
function nombre(id){var d=state.docentes.find(function(x){return x.id===id;});return d?d.nombre:"(sin nombre)";}
function cmp(a,b){return a.localeCompare(b,"es",{numeric:true,sensitivity:"base"});}
function ordenar(ids){return ids.slice().sort(function(a,b){return cmp(nombre(a),nombre(b));});}
function proy(id){return state.proyectos.find(function(p){return p.id===id;});}
/* orden de presentación: primero los proyectos con docentes (en cualquiera de los dos años), al final los vacíos; dentro de cada grupo se respeta el orden guardado */
function proyOrden(){
  var con=[],sin=[];
  state.proyectos.forEach(function(p){(p.actual.length||p.proximo.length?con:sin).push(p);});
  return con.concat(sin);
}
function partes(p){
  return {
    cont:ordenar(p.actual.filter(function(i){return p.proximo.indexOf(i)>=0;})),
    sale:ordenar(p.actual.filter(function(i){return p.proximo.indexOf(i)<0;})),
    ingresa:ordenar(p.proximo.filter(function(i){return p.actual.indexOf(i)<0;}))
  };
}

/* ---------- Persistencia ---------- */
function setStatus(){
  var el=$("estado"),t,s;
  if(mode==="wait"){t="Conectando…";s="wait";}
  else if(mode==="local"){t=ui.conexion==="sinCuenta"?"Sin sesión: no ves los datos compartidos":"Solo en este navegador";s="local";}
  else if(mode==="readonly"){t="Solo lectura: tus cambios no se comparten";s="local";}
  else if(dirty||saving||actDirty||actSaving||dgDirty||dgSaving||caDirty||caSaving||poaDirty||poaSaving){t="Guardando…";s="saving";}
  else{t="Guardado";s="ok";}
  el.textContent=t; el.dataset.s=s;
  dgPermisos();
}
function lsWrite(){try{localStorage.setItem(LS_KEY,JSON.stringify(state));}catch(e){}}
function lsRead(){try{var r=localStorage.getItem(LS_KEY);return r?normalizar(JSON.parse(r)):null;}catch(e){return null;}}
function commit(){
  render(); lsWrite();
  if(mode==="shared"){dirty=true;setStatus();clearTimeout(timer);timer=setTimeout(flush,600);}
}
function flush(){
  if(mode!=="shared"||saving||!dirty||!docRef)return;
  var json=JSON.stringify(state);
  if(json===lastJson){dirty=false;setStatus();return;}
  saving=true;dirty=false;setStatus();
  docRef.set(JSON.parse(json)).then(function(){
    lastJson=json;saving=false;setStatus();
    if(dirty)flush();
  }).catch(function(e){
    saving=false;
    mode=(e&&e.code==="invalid_argument")?"readonly":"local";
    ui.msg="No se pudo guardar de forma compartida. Seguís trabajando y los cambios quedan en este navegador.";
    render();
  });
}
function adoptar(data){
  var n=normalizar(data),j=JSON.stringify(n);
  if(j===JSON.stringify(state)){lastJson=j;return;}
  var a=document.activeElement;
  if(a&&a.tagName==="INPUT"&&a.type==="text"&&a.value!==a.defaultValue){pendingRemote=n;return;}
  state=n;lastJson=j;render();
}
function conectar(){
  if(!window.claude||!window.claude.use){sinDb();return;}
  window.claude.use("downloads").then(function(d){downloads=d;}).catch(function(){});
  window.claude.use("user").then(function(u){return u?u.can("data.write"):null;}).then(function(c){
    canWrite=c; if(c===false&&mode==="shared"){mode="readonly";setStatus();}
  }).catch(function(){});
  window.claude.use("db").then(function(d){
    if(!d){sinDb();return;}
    db=d;docRef=db.doc("tablero/principal");actRef=db.doc("tablero/actividades");dgRef=db.doc("tablero/direcciones");caRef=db.doc("tablero/cargas");poaRef=db.doc("tablero/poa");
    poaRef.onSnapshot(function(snap){
      if(snap.metadata&&snap.metadata.hasPendingWrites)return;
      poaLoaded=true;
      if(poaDirty||poaSaving)return;
      if(snap.exists)adoptPoa(snap.data());
      else if(!ui.editPoa&&!ui.editPer)renderPoa();
    },function(){
      poa=poaLsRead()||poaVacio();poaLoaded=true;renderPoa();
    });
    caRef.onSnapshot(function(snap){
      if(snap.metadata&&snap.metadata.hasPendingWrites)return;
      caLoaded=true;
      if(caDirty||caSaving)return;
      if(snap.exists)adoptCa(snap.data());
      else if(!ui.editCa)renderCa();
    },function(){
      ca=caLsRead()||caVacio();caLoaded=true;renderCa();
    });
    dgRef.onSnapshot(function(snap){
      if(snap.metadata&&snap.metadata.hasPendingWrites)return;
      dgLoaded=true;
      if(dgDirty||dgSaving)return;
      if(snap.exists)adoptDg(snap.data());
      else if(!ui.editDg)renderDg();
    },function(){
      dg=dgLsRead()||dgVacio();dgLoaded=true;renderDg();
    });
    actRef.onSnapshot(function(snap){
      if(snap.metadata&&snap.metadata.hasPendingWrites)return;
      actLoaded=true;
      if(actDirty||actSaving)return;
      if(snap.exists)adoptActs(snap.data());
      else if(!ui.editAct)renderActs();
    },function(){
      acts=actLsRead()||{items:[]};actLoaded=true;renderActs();
    });
    docRef.onSnapshot(function(snap){
      if(snap.metadata&&snap.metadata.hasPendingWrites)return;
      if(mode==="wait"){mode=canWrite===false?"readonly":"shared";}
      if(dirty||saving)return;
      if(snap.exists)adoptar(snap.data());
      else if(!lastJson){state=vacio();render();}
      setStatus();
    },function(){
      if(mode==="wait"){state=lsRead()||vacio();}
      mode="local";ui.conexion="error";render();
    });
  }).catch(function(){sinDb();});
}

/* ---------- Tablas (página, Word y portapapeles comparten esta fuente) ---------- */
function tablas(sc){if(sc==="poa")return poaTablas();var t=todasTablas();return sc==="act"?[t[2]]:sc==="dg"?[t[3]]:sc==="ca"?[t[4]]:[t[0],t[1]];}
function todasTablas(){
  var lista=function(ids){return ids.map(nombre).join(", ")||"—";};
  return [
    {titulo:"Proyectos "+state.anioActual,cols:["Proyecto","Integrantes","N.º"],anchos:[5000,7372,1200],
     filas:proyOrden().map(function(p){return [p.nombre,lista(ordenar(p.actual)),String(p.actual.length)];})},
    {titulo:"Proyectos "+state.anioProximo,cols:["Proyecto","Integrantes","Continúan","Ingresan","Salen","N.º"],anchos:[3200,3000,2600,2000,2000,772],
     filas:proyOrden().map(function(p){var x=partes(p);return [p.nombre,lista(ordenar(p.proximo)),lista(x.cont),lista(x.ingresa),lista(x.sale),String(p.proximo.length)];})},
    {titulo:("Actividades institucionales "+aniosActs()).trim(),cols:["Fecha","Día","Actividad","Responsables"],anchos:[2200,1600,5400,4372],texto:true,vacio:"(Sin actividades)",
     filas:actsOrden().map(function(a){return [fechaLarga(a.fecha),mayus(diaNombre(a.fecha)),a.actividad,a.responsables||"—"];})},
    {titulo:("Direcciones de grupo "+dg.anio).trim(),cols:["Grupo","Docente","Jornada","Sede"],anchos:[1800,6372,2700,2700],texto:true,vacio:"(Sin direcciones de grupo)",
     filas:dgOrden().filter(function(a){return a.grupo;}).concat(dgOrden().filter(function(a){return !a.grupo;})).map(function(a){return [a.grupo||"Sin dirección de grupo",a.docente,a.jornada||"—",a.sede||"—"];})},
    {titulo:"Cargas académicas",cols:["Docente","Asignatura","Grupos y horas","Horas"],anchos:[3400,4000,4972,1200],vacio:"(Sin cargas)",filas:caFilas()}
  ];
}
function textoTablas(){
  var out=[(state.institucion||"I.E. Marco Fidel Suárez")];
  tablas(ui.tab).forEach(function(t){out.push("",t.titulo,t.cols.join("\t"));t.filas.forEach(function(f){out.push(f.join("\t"));});});
  return out.join("\n");
}

/* ---------- Word (.docx) ---------- */
function x(s){return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function wp(text,o){
  o=o||{};
  return '<w:p><w:pPr><w:spacing w:before="'+(o.before||0)+'" w:after="'+(o.after==null?120:o.after)+'"/>'+(o.align?'<w:jc w:val="'+o.align+'"/>':'')+'</w:pPr>'+
    '<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>'+(o.bold?'<w:b/>':'')+(o.color?'<w:color w:val="'+o.color+'"/>':'')+'<w:sz w:val="'+(o.size||22)+'"/><w:szCs w:val="'+(o.size||22)+'"/></w:rPr>'+
    '<w:t xml:space="preserve">'+x(text)+'</w:t></w:r></w:p>';
}
function wtbl(t){
  var total=t.anchos.reduce(function(a,b){return a+b;},0);
  var b=function(n){return '<w:'+n+' w:val="single" w:sz="6" w:space="0" w:color="444444"/>';};
  var cell=function(txt,w,head,right){
    return '<w:tc><w:tcPr><w:tcW w:w="'+w+'" w:type="dxa"/>'+(head?'<w:shd w:val="clear" w:color="auto" w:fill="D9E2DC"/>':'')+'</w:tcPr>'+wp(txt,{bold:head,size:head?20:21,after:40,before:40,align:right?"right":null})+'</w:tc>';
  };
  var xml='<w:tbl><w:tblPr><w:tblW w:w="'+total+'" w:type="dxa"/><w:tblBorders>'+b("top")+b("left")+b("bottom")+b("right")+b("insideH")+b("insideV")+'</w:tblBorders><w:tblLayout w:type="fixed"/>'+
    '<w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>'+
    t.anchos.map(function(w){return '<w:gridCol w:w="'+w+'"/>';}).join("")+'</w:tblGrid>';
  xml+='<w:tr><w:trPr><w:tblHeader/></w:trPr>'+t.cols.map(function(c,i){return cell(c,t.anchos[i],true,false);}).join("")+'</w:tr>';
  var filas=t.filas.length?t.filas:[t.cols.map(function(_,i){return i===0?(t.vacio||"(Sin proyectos)"):"";})];
  filas.forEach(function(f){xml+='<w:tr>'+f.map(function(c,i){return cell(c,t.anchos[i],false,!t.texto&&i===f.length-1);}).join("")+'</w:tr>';});
  return xml+'</w:tbl>';
}
function docx(){
  var fecha=new Date().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"});
  var body=wp(state.institucion||"I.E. Marco Fidel Suárez",{bold:true,size:36,after:60})+
    wp(ui.tab==="poa"?"Plan operativo anual":ui.tab==="ca"?"Cargas académicas":ui.tab==="dg"?"Direcciones de grupo":ui.tab==="act"?"Actividades institucionales":"Asignación de proyectos institucionales",{size:26,after:40})+
    wp("Fecha: "+fecha,{size:20,color:"555555",after:240});
  tablas(ui.tab).forEach(function(t){body+=wp(t.titulo,{bold:true,size:28,before:240,after:120})+wtbl(t)+wp("",{after:0});});
  body+='<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>';
  var doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+body+'</w:body></w:document>';
  var zip=new JSZip();
  zip.file("[Content_Types].xml",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("_rels/.rels",'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file("word/document.xml",doc);
  return zip.generateAsync({type:"blob",compression:"DEFLATE"});
}
function descargarWord(){
  if(!downloads||!window.JSZip){
    ui.msg="La descarga no está disponible en esta vista. Usá «Copiar tablas» y pegalas en Word: quedan como tabla.";
    render();return;
  }
  var nombreArchivo=ui.tab==="poa"?("POA "+poa.anio+(poaMesActual()==="todo"?"":" "+mayus(MESES[+poaMesActual().slice(5,7)-1]))).trim()+".docx":ui.tab==="ca"?"Cargas académicas.docx":ui.tab==="dg"?("Direcciones de grupo "+dg.anio).trim()+".docx":ui.tab==="act"?("Actividades "+aniosActs().replace(/ – /g,"-")).trim()+".docx":"Proyectos "+state.anioActual+" y "+state.anioProximo+".docx";
  docx().then(function(blob){return downloads.save({filename:nombreArchivo,data:blob});}).then(function(){
    ui.msg=ui.tab==="poa"?"Word del plan operativo descargado.":ui.tab==="ca"?"Word de cargas académicas descargado.":ui.tab==="dg"?"Word de direcciones de grupo descargado.":ui.tab==="act"?"Word de actividades descargado.":"Word de proyectos descargado.";render();
  }).catch(function(e){
    var c=e&&e.code;
    if(c==="declined")ui.msg="Descarga cancelada.";
    else if(c==="rate_limited")ui.msg="Ya hay una descarga pendiente de confirmar. Esperá un momento y probá de nuevo.";
    else ui.msg="No se pudo descargar el Word en esta vista. Usá «Copiar tablas» y pegalas en Word: quedan como tabla.";
    render();
  });
}
function copiarTablas(){
  var t=textoTablas();
  var fallback=function(){ui.copyText=t;ui.msg="No se pudo copiar automáticamente. Seleccioná el texto, copialo y pegalo en Word.";render();var a=$("copy-area");if(a){a.focus();a.select();}};
  try{navigator.clipboard.writeText(t).then(function(){ui.copyText=null;ui.msg=(ui.tab==="poa"?"Plan operativo copiado":ui.tab==="ca"?"Cargas académicas copiadas":ui.tab==="dg"?"Direcciones de grupo copiadas":ui.tab==="act"?"Actividades copiadas":"Tablas de proyectos copiadas")+". Pegalas en Word y usá «Convertir texto en tabla» (separador: tabulaciones).";render();}).catch(fallback);}
  catch(e){fallback();}
}

/* ---------- Actividades (doc aparte: tablero/actividades) ---------- */
var ACT_LS="tablero-actividades-v1",TAB_LS="tablero-tab-v1",TEMA_LS="tablero-tema-v1";
var DIAS=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
var MESES=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
var acts={items:[]},actRef=null,actDirty=false,actSaving=false,actTimer=null,actLast="",actPending=null,actLoaded=false;
function normActs(d){
  d=d||{};
  return {items:(Array.isArray(d.items)?d.items:[]).filter(function(a){return a&&a.id;}).map(function(a){
    return {id:String(a.id),fecha:/^\d{4}-\d{2}-\d{2}$/.test(a.fecha||"")?a.fecha:"",actividad:String(a.actividad||""),responsables:String(a.responsables||"")};
  })};
}
function fechaObj(f){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(f||"");return m?new Date(+m[1],+m[2]-1,+m[3]):null;}
function diaNombre(f){var d=fechaObj(f);return d?DIAS[d.getDay()]:"";}
function fechaLarga(f){var d=fechaObj(f);return d?d.getDate()+" de "+MESES[d.getMonth()]+" de "+d.getFullYear():"Sin fecha";}
function hoyISO(){var d=new Date(),p=function(n){return (n<10?"0":"")+n;};return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());}
function mayus(t){return t.charAt(0).toUpperCase()+t.slice(1);}
function plano(t){return String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");}
function actsOrden(){
  return acts.items.slice().sort(function(a,b){
    if(a.fecha!==b.fecha){if(!a.fecha)return 1;if(!b.fecha)return -1;return a.fecha<b.fecha?-1:1;}
    return cmp(a.actividad,b.actividad);
  });
}
function aniosActs(){var y=[];acts.items.forEach(function(a){var v=a.fecha.slice(0,4);if(v&&y.indexOf(v)<0)y.push(v);});return y.sort().join(" – ");}
function actLsWrite(){try{localStorage.setItem(ACT_LS,JSON.stringify(acts));}catch(e){}}
function actLsRead(){try{var r=localStorage.getItem(ACT_LS);return r?normActs(JSON.parse(r)):null;}catch(e){return null;}}
/* sin base de datos (quien abre el enlace sin iniciar sesión en Claude): se avisa en vez de mostrar el portal vacío */
function sinDb(){mode="local";ui.conexion="sinCuenta";state=lsRead()||vacio();acts=actLsRead()||{items:[]};actLoaded=true;dg=dgLsRead()||dgVacio();dgLoaded=true;ca=caLsRead()||caVacio();caLoaded=true;poa=poaLsRead()||poaVacio();poaLoaded=true;render();renderActs();renderDg();renderCa();renderPoa();}
/* si llegó un cambio remoto mientras se editaba, se parte de esa versión para no pisarla */
function baseActs(){if(actPending){acts=actPending;actPending=null;}}
function commitActs(){
  renderActs(); actLsWrite();
  if(mode==="shared"){actDirty=true;setStatus();clearTimeout(actTimer);actTimer=setTimeout(flushActs,600);}
}
function flushActs(){
  if(mode!=="shared"||actSaving||!actDirty||!actRef)return;
  var json=JSON.stringify(acts);
  if(json===actLast){actDirty=false;setStatus();return;}
  actSaving=true;actDirty=false;setStatus();
  actRef.set(JSON.parse(json)).then(function(){
    actLast=json;actSaving=false;setStatus();
    if(actDirty)flushActs();
  }).catch(function(e){
    actSaving=false;
    mode=(e&&e.code==="invalid_argument")?"readonly":"local";
    ui.msg="No se pudieron guardar las actividades de forma compartida. Los cambios quedan en este navegador.";
    render();
  });
}
function adoptActs(data){
  var n=normActs(data),j=JSON.stringify(n);
  if(j===JSON.stringify(acts)){actLast=j;if(!ui.editAct)renderActs();return;}
  if(ui.editAct){actPending=n;return;}
  acts=n;actLast=j;renderActs();
}
function actRow(a,next,hoy){
  if(ui.editAct===a.id){
    return '<form class="act editing" data-form="editAct" data-id="'+esc(a.id)+'">'+
      '<input type="date" id="ea-fecha-'+esc(a.id)+'" data-k="fecha" value="'+esc(a.fecha)+'" required aria-label="Fecha">'+
      '<input type="text" id="ea-act-'+esc(a.id)+'" data-k="actividad" value="'+esc(a.actividad)+'" required aria-label="Actividad">'+
      '<input type="text" id="ea-resp-'+esc(a.id)+'" data-k="responsables" value="'+esc(a.responsables)+'" aria-label="Responsables, separados por punto y coma">'+
      '<span class="row"><button class="btn small primary" type="submit">Guardar</button><button class="btn small" type="button" data-act="cancelAct" data-id="'+esc(a.id)+'">Cancelar</button></span></form>';
  }
  var d=fechaObj(a.fecha),c=confirmar("act:"+a.id,"eliminar","delAct");
  var pills=a.responsables.split(";").map(function(r){return r.trim();}).filter(Boolean).map(function(r){
    return '<span class="pill'+(/por definir/i.test(r)?" pend":"")+'">'+esc(r)+'</span>';
  }).join("")||'<span class="muted">Sin responsables</span>';
  return '<article class="act'+(a.fecha&&a.fecha<hoy?" past":"")+(next?" next":"")+'">'+
    '<div class="act-date"><b>'+(d?d.getDate():"—")+'</b><span>'+esc(diaNombre(a.fecha))+'</span></div>'+
    '<div class="act-name"><span>'+esc(a.actividad)+'</span>'+(next?'<span class="tag next-tag">Próxima</span>':'')+'</div>'+
    '<div class="pills">'+pills+'</div>'+
    (c||'<span class="row"><button class="btn small" id="ed-'+esc(a.id)+'" data-act="editAct" data-id="'+esc(a.id)+'">Editar</button><button class="btn small danger" id="da-'+esc(a.id)+'" data-act="ask" data-key="'+esc("act:"+a.id)+'">Eliminar</button></span>')+
    '</article>';
}
function renderActs(){
  var list=$("act-list");if(!list)return;
  var orden=actsOrden(),hoy=hoyISO(),anios=aniosActs(),n=acts.items.length;
  var prox=orden.find(function(a){return a.fecha&&a.fecha>=hoy;})||null;
  $("act-titulo").textContent="Actividades institucionales"+(anios?" "+anios:"");
  $("tab-act-n").textContent=n?String(n):"";
  $("act-resumen").textContent=!n?"":n+(n===1?" actividad":" actividades")+(prox?" · Próxima: "+prox.actividad+", "+diaNombre(prox.fecha)+" "+fechaLarga(prox.fecha):"");
  var q=plano(ui.actFilter||"").trim();
  var vis=q?orden.filter(function(a){return plano(a.actividad+" "+a.responsables+" "+diaNombre(a.fecha)+" "+fechaLarga(a.fecha)).indexOf(q)>=0;}):orden;
  var h;
  if(!actLoaded)h='<p class="muted">Cargando actividades…</p>';
  else if(!n)h='<div class="empty"><h3>Todavía no hay actividades</h3><p style="margin:0;max-width:65ch">Abrí «Agregar actividad» y cargá la primera: fecha, nombre y responsables separados por punto y coma.</p></div>';
  else if(!vis.length)h='<p class="muted">Ninguna actividad coincide con «'+esc((ui.actFilter||"").trim())+'».</p>';
  else{
    var grupos=[],g=null;
    vis.forEach(function(a){var k=a.fecha.slice(0,7);if(!g||g.k!==k){g={k:k,items:[]};grupos.push(g);}g.items.push(a);});
    h=grupos.map(function(gr){
      var d=fechaObj(gr.k+"-01");
      return '<div class="month"><div class="month-head"><h3>'+(d?esc(mayus(MESES[d.getMonth()])+" "+d.getFullYear()):"Sin fecha")+'</h3><span class="muted">'+gr.items.length+'</span></div>'+
        gr.items.map(function(a){return actRow(a,!!prox&&prox.id===a.id,hoy);}).join("")+'</div>';
    }).join("");
  }
  list.innerHTML=h;
  renderTablas();
  if(ui.actFocus){var el=$(ui.actFocus);ui.actFocus=null;if(el){try{el.focus({preventScroll:true});}catch(e){}}}
}
function guardarAct(f){
  var val=function(k){var i=f.querySelector('[data-k="'+k+'"]');return i?i.value.trim():"";};
  var fe=val("fecha"),ac=val("actividad"),re=val("responsables");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fe)||!ac){ui.msg="Poné la fecha y el nombre de la actividad.";renderTop();return;}
  baseActs();
  if(f.dataset.form==="editAct"){
    var id=f.dataset.id,o=acts.items.find(function(a){return a.id===id;});
    if(o){o.fecha=fe;o.actividad=ac;o.responsables=re;}
    ui.editAct=null;ui.actFocus="ed-"+id;
  }else{
    acts.items.push({id:uid("a"),fecha:fe,actividad:ac,responsables:re});
    f.reset();
  }
  commitActs();
}
function setTab(t,save){
  ui.tab=(t==="act"||t==="dg"||t==="ca"||t==="poa")?t:"proy";
  $("view-proy").hidden=ui.tab!=="proy";$("view-act").hidden=ui.tab!=="act";$("view-dg").hidden=ui.tab!=="dg";$("view-ca").hidden=ui.tab!=="ca";$("view-poa").hidden=ui.tab!=="poa";
  $("tab-proy").setAttribute("aria-selected",String(ui.tab==="proy"));
  $("tab-act").setAttribute("aria-selected",String(ui.tab==="act"));
  $("tab-dg").setAttribute("aria-selected",String(ui.tab==="dg"));
  $("tab-ca").setAttribute("aria-selected",String(ui.tab==="ca"));
  $("tab-poa").setAttribute("aria-selected",String(ui.tab==="poa"));
  $("btn-copiar").textContent=ui.tab==="poa"?"Copiar POA":ui.tab==="ca"?"Copiar cargas":ui.tab==="dg"?"Copiar direcciones":ui.tab==="act"?"Copiar actividades":"Copiar proyectos";
  $("btn-word").textContent=ui.tab==="poa"?"Word del POA":ui.tab==="ca"?"Word de cargas":ui.tab==="dg"?"Word de direcciones":ui.tab==="act"?"Word de actividades":"Word de proyectos";
  if(save){try{localStorage.setItem(TAB_LS,ui.tab);}catch(e){}}
}
/* ---------- Direcciones de grupo (doc aparte: tablero/direcciones) ---------- */
var DG_LS="tablero-direcciones-v1";
function dgVacio(){return {anio:"",items:[]};}
var dg=dgVacio(),dgRef=null,dgDirty=false,dgSaving=false,dgTimer=null,dgLast="",dgPending=null,dgLoaded=false;
function normDg(d){
  d=d||{};
  return {anio:String(d.anio||""),items:(Array.isArray(d.items)?d.items:[]).filter(function(a){return a&&a.id;}).map(function(a){
    return {id:String(a.id),sede:String(a.sede||""),grupo:String(a.grupo||""),docente:String(a.docente||""),jornada:String(a.jornada||"")};
  })};
}
/* Clave de persona: sin tildes/mayúsculas/espacios sobrantes y sin importar el orden de las palabras */
function dgClave(n){return plano(n||"").replace(/[^a-z0-9ñ\s]/g," ").split(/\s+/).filter(Boolean).sort().join(" ");}
/* Un docente con grupo asignado no cuenta como «sin dirección», aunque quede una fila suelta sin grupo */
function dgVisibles(){
  var conGrupo={};
  dg.items.forEach(function(a){if(a.grupo)conGrupo[dgClave(a.docente)]=true;});
  return dg.items.filter(function(a){return a.grupo||!conGrupo[dgClave(a.docente)];});
}
function dgOrden(){return dgVisibles().sort(function(a,b){return cmp(a.grupo,b.grupo)||cmp(a.docente,b.docente);});}
function dgLsWrite(){try{localStorage.setItem(DG_LS,JSON.stringify(dg));}catch(e){}}
function dgLsRead(){try{var r=localStorage.getItem(DG_LS);return r?normDg(JSON.parse(r)):null;}catch(e){return null;}}
function baseDg(){if(dgPending){dg=dgPending;dgPending=null;}}
function commitDg(){
  renderDg(); dgLsWrite();
  if(mode==="shared"){dgDirty=true;setStatus();clearTimeout(dgTimer);dgTimer=setTimeout(flushDg,600);}
}
function flushDg(){
  if(mode!=="shared"||dgSaving||!dgDirty||!dgRef)return;
  var json=JSON.stringify(dg);
  if(json===dgLast){dgDirty=false;setStatus();return;}
  dgSaving=true;dgDirty=false;setStatus();
  dgRef.set(JSON.parse(json)).then(function(){
    dgLast=json;dgSaving=false;setStatus();
    if(dgDirty)flushDg();
  }).catch(function(e){
    dgSaving=false;
    mode=(e&&e.code==="invalid_argument")?"readonly":"local";
    ui.msg="No se pudieron guardar las direcciones de grupo de forma compartida. Los cambios quedan en este navegador.";
    render();
  });
}
function adoptDg(data){
  var n=normDg(data),j=JSON.stringify(n);
  if(j===JSON.stringify(dg)){dgLast=j;if(!ui.editDg)renderDg();return;}
  if(ui.editDg){dgPending=n;return;}
  dg=n;dgLast=j;renderDg();
}
function jornadaOpts(v){
  var base=["Mañana","Tarde"];if(v&&base.indexOf(v)<0)base.push(v);
  return '<option value=""'+(v?"":" selected")+'>Sin definir</option>'+base.map(function(o){return '<option'+(o===v?" selected":"")+'>'+esc(o)+'</option>';}).join("");
}
function dgRow(a){
  var id=esc(a.id);
  if(ui.editDg===a.id){
    return '<form class="dg editing" data-form="editDg" data-id="'+id+'">'+
      '<input type="text" id="eg-grupo-'+id+'" data-k="grupo" value="'+esc(a.grupo)+'" placeholder="Grupo (vacío si no dirige)" aria-label="Grupo, vacío si no tiene dirección de grupo">'+
      '<input type="text" id="eg-doc-'+id+'" data-k="docente" value="'+esc(a.docente)+'" required aria-label="Docente">'+
      '<select id="eg-jor-'+id+'" data-k="jornada" aria-label="Jornada">'+jornadaOpts(a.jornada)+'</select>'+
      '<input type="text" id="eg-sede-'+id+'" data-k="sede" value="'+esc(a.sede)+'" aria-label="Sede">'+
      '<span class="row"><button class="btn small primary" type="submit">Guardar</button><button class="btn small" type="button" data-act="cancelDg" data-id="'+id+'">Cancelar</button></span></form>';
  }
  var c=confirmar("dg:"+a.id,"eliminar","delDg");
  return '<article class="dg"><div class="dg-grupo">'+esc(a.grupo||"—")+'</div><div class="dg-body">'+
    '<div class="dg-nombre">'+esc(a.docente||"(Sin docente)")+'</div>'+
    '<div class="pills">'+(a.jornada?'<span class="pill">'+esc(a.jornada)+'</span>':(a.grupo?'<span class="pill pend">Sin jornada</span>':''))+(a.sede?'<span class="pill">Sede '+esc(a.sede)+'</span>':'')+'</div>'+
    (c||'<span class="row"><button class="btn small" id="eg-'+id+'" data-act="editDg" data-id="'+id+'">Editar</button><button class="btn small danger" id="dd-'+id+'" data-act="ask" data-key="'+esc("dg:"+a.id)+'">Eliminar</button></span>')+
    '</div></article>';
}
function renderDg(){
  var list=$("dg-list");if(!list)return;
  var orden=dgOrden(),con=orden.filter(function(a){return a.grupo;}),n=con.length,libres=orden.length-n,man=0,tar=0,sin=0;
  con.forEach(function(a){var j=plano(a.jornada);if(j.indexOf("man")===0)man++;else if(j.indexOf("tar")===0)tar++;else if(!j)sin++;});
  $("dg-titulo").textContent=("Direcciones de grupo "+dg.anio).trim();
  $("tab-dg-n").textContent=n?String(n):"";
  $("dg-resumen").textContent=!dg.items.length?"":n+(n===1?" grupo":" grupos")+" · "+tar+" en la tarde · "+man+" en la mañana"+(sin?" · "+sin+" sin jornada":"")+(libres?" · "+libres+(libres===1?" docente":" docentes")+" sin dirección de grupo":"");
  var an=$("dg-anio");if(an&&an!==document.activeElement&&dgAnioNuevo===null)an.value=dg.anio;
  dgPermisos();
  var q=plano(ui.dgFilter||"").trim();
  var vis=q?orden.filter(function(a){return plano((a.grupo||"sin dirección de grupo")+" "+a.docente+" "+a.jornada+" "+a.sede).indexOf(q)>=0;}):orden;
  var h;
  if(!dgLoaded)h='<p class="muted">Cargando direcciones de grupo…</p>';
  else if(!dg.items.length)h='<div class="empty"><h3>Todavía no hay direcciones de grupo</h3><p style="margin:0;max-width:65ch">Abrí «Agregar grupo o docente» y cargá la primera: grupo, docente, jornada y sede.</p></div>';
  else if(!vis.length)h='<p class="muted">Ningún grupo coincide con «'+esc((ui.dgFilter||"").trim())+'».</p>';
  else{
    var v1=vis.filter(function(a){return a.grupo;}),v2=vis.filter(function(a){return !a.grupo;});
    h=v1.map(dgRow).join("")+(v2.length?'<div class="month-head"><h3>'+esc(("Docentes sin dirección de grupo "+dg.anio).trim())+'</h3><span class="muted">'+v2.length+'</span></div>'+v2.map(dgRow).join(""):"");
  }
  list.innerHTML=h;
  renderResumen();renderPendientes();
  if(ui.dgFocus){var el=$(ui.dgFocus);ui.dgFocus=null;if(el){try{el.focus({preventScroll:true});}catch(e){}}}
}
function guardarDg(f){
  var val=function(k){var i=f.querySelector('[data-k="'+k+'"]');return i?i.value.trim():"";};
  var gr=val("grupo").replace(/\s+/g,"").toUpperCase(),doc=val("docente");
  var esNuevo=f.dataset.form==="newDg",selfId=esNuevo?null:f.dataset.id;
  if(esNuevo&&mode==="readonly"){dgAviso("Tu cuenta es de solo lectura: no puedes agregar grupos.","err");return;}
  if(!doc){dgAviso("Escribe el nombre del docente.","err");return;}
  baseDg();
  var sede=val("sede"),dup=gr?dg.items.find(function(a){return a.id!==selfId&&a.grupo&&plano(a.grupo)===plano(gr)&&plano(a.sede)===plano(sede);}):null;
  if(dup){dgAviso("Ya existe el grupo "+gr+(sede?" en la sede "+sede:"")+" (docente: "+(dup.docente||"sin nombre")+"). Edita ese registro o usa otro código.","err");return;}
  var kDoc=dgClave(doc);
  if(esNuevo&&!gr&&dg.items.some(function(a){return a.grupo&&dgClave(a.docente)===kDoc;})){dgAviso(doc+" ya tiene dirección de grupo; no hace falta agregarlo sin grupo.","err");return;}
  /* si ahora tiene grupo, se retira su fila antigua «sin grupo» para no duplicarlo */
  var libre=function(a){return a.id!==selfId&&!a.grupo&&dgClave(a.docente)===kDoc;};
  if(!esNuevo){
    var id=f.dataset.id,o=dg.items.find(function(a){return a.id===id;});
    if(o){o.grupo=gr;o.docente=doc;o.jornada=val("jornada");o.sede=sede;}
    if(gr)dg.items=dg.items.filter(function(a){return !libre(a);});
    ui.editDg=null;ui.dgFocus="eg-"+id;
  }else{
    if(gr)dg.items=dg.items.filter(function(a){return !libre(a);});
    dg.items.push({id:uid("g"),sede:sede,grupo:gr,docente:doc,jornada:val("jornada")});
    f.reset();ui.dgFocus="nd-grupo";
    dgAviso(gr?"Grupo "+gr+" agregado con "+doc+".":doc+" agregado sin dirección de grupo.","ok");
  }
  commitDg();
}
/* ---- aviso en la página y cambio de año con confirmación (sin window.confirm) ---- */
var dgAvisoT=null,dgAnioNuevo=null;
function dgAviso(t,tipo){
  var el=$("dg-aviso");if(!el)return;
  clearTimeout(dgAvisoT);
  el.textContent=t;el.className="msg dg-aviso"+(tipo==="err"?" err":"");el.setAttribute("role",tipo==="err"?"alert":"status");el.hidden=false;
  if(tipo!=="err")dgAvisoT=setTimeout(function(){el.hidden=true;},6000);
}
function dgPermisos(){
  var ro=mode==="readonly",n=$("dg-nueva"),a=$("dg-anio"),b=$("dg-anio-btn");
  if(n)n.hidden=ro;if(b)b.hidden=ro;if(a)a.disabled=ro;
}
function dgAnioPedir(){
  var inp=$("dg-anio");if(!inp||mode==="readonly")return;
  var to=inp.value.trim(),from=dg.anio;
  if(!/^\d{4}$/.test(to)||+to<2000||+to>2100){dgAviso("Escribe un año válido de cuatro cifras, por ejemplo 2027.","err");return;}
  if(to===from){dgAviso("Las direcciones de grupo ya están en el año "+from+".","err");return;}
  dgAnioNuevo=to;
  var n=dg.items.length;
  $("dg-anio-confirm-d").textContent="Año actual: "+(from||"(sin año)")+". Año nuevo: "+to+". Se conservarán los "+n+(n===1?" registro":" registros")+" de direcciones de grupo tal como están; no se borra nada. Solo cambia el año que aparece en los títulos, en las tablas copiadas y en el Word. Después podrás editar los grupos o agregar nuevos para "+to+".";
  $("dg-aviso").hidden=true;$("dg-anio-confirm").hidden=false;
  $("dg-anio-ok").focus();
}
function dgAnioCerrar(devolverFoco){
  dgAnioNuevo=null;$("dg-anio-confirm").hidden=true;
  var inp=$("dg-anio");if(inp)inp.value=dg.anio;
  if(devolverFoco){var b=$("dg-anio-btn");if(b&&!b.hidden)b.focus();}
}
function dgAnioAplicar(){
  var to=dgAnioNuevo;if(!to||mode==="readonly"){dgAnioCerrar(true);return;}
  baseDg();dg.anio=to;commitDg();
  dgAnioCerrar(true);dgAviso("Año actualizado a "+to+".","ok");
}

/* ---------- Cargas académicas (doc aparte: tablero/cargas) ---------- */
var CA_LS="tablero-cargas-v1",CAV_LS="tablero-cargas-vista-v1";
function caVacio(){return {tope:22,items:[]};}
var ca=caVacio(),caRef=null,caDirty=false,caSaving=false,caTimer=null,caLast="",caPending=null,caLoaded=false;
function normCa(d){
  d=d||{};var t=Number(d.tope);
  return {tope:t>0?t:22,items:(Array.isArray(d.items)?d.items:[]).filter(function(a){return a&&a.id;}).map(function(a){
    var h=Number(a.horas);
    return {id:String(a.id),docente:String(a.docente||""),asignatura:String(a.asignatura||""),grupo:String(a.grupo||""),horas:h>0?h:0};
  })};
}
function caLsWrite(){try{localStorage.setItem(CA_LS,JSON.stringify(ca));}catch(e){}}
function caLsRead(){try{var r=localStorage.getItem(CA_LS);return r?normCa(JSON.parse(r)):null;}catch(e){return null;}}
function baseCa(){if(caPending){ca=caPending;caPending=null;}}
function commitCa(){
  renderCa(); caLsWrite();
  if(mode==="shared"){caDirty=true;setStatus();clearTimeout(caTimer);caTimer=setTimeout(flushCa,600);}
}
function flushCa(){
  if(mode!=="shared"||caSaving||!caDirty||!caRef)return;
  var json=JSON.stringify(ca);
  if(json===caLast){caDirty=false;setStatus();return;}
  caSaving=true;caDirty=false;setStatus();
  caRef.set(JSON.parse(json)).then(function(){
    caLast=json;caSaving=false;setStatus();
    if(caDirty)flushCa();
  }).catch(function(e){
    caSaving=false;
    mode=(e&&e.code==="invalid_argument")?"readonly":"local";
    ui.msg="No se pudieron guardar las cargas de forma compartida. Los cambios quedan en este navegador.";
    render();
  });
}
function adoptCa(data){
  var n=normCa(data),j=JSON.stringify(n);
  if(j===JSON.stringify(ca)){caLast=j;if(!ui.editCa)renderCa();return;}
  if(ui.editCa){caPending=n;return;}
  ca=n;caLast=j;renderCa();
}
function unicos(arr){var o=[];arr.forEach(function(v){if(v&&o.indexOf(v)<0)o.push(v);});return o.sort(cmp);}
function suma(items){return items.reduce(function(t,a){return t+a.horas;},0);}
function normGrupo(t){return String(t).replace(/[\s°º.]/g,"").toUpperCase();}
function corta(t){return t.replace(/\s*\([^)]*\)/g,"");}
function caDe(k,v,items){return (items||ca.items).filter(function(a){return a[k]===v;});}
function estadoCa(total){
  var d=total-ca.tope;
  return d===0?{c:"st-ok",t:"Completa"}:d<0?{c:"st-falta",t:"Faltan "+(-d)+" h"}:{c:"st-sobra",t:"Sobran "+d+" h"};
}
function porGrupo(a,b){return cmp(a.grupo,b.grupo)||cmp(a.asignatura,b.asignatura);}
function porAsig(a,b){return cmp(a.asignatura,b.asignatura)||cmp(a.grupo,b.grupo);}
function caFilas(){
  var out=[];
  unicos(ca.items.map(function(a){return a.docente;})).forEach(function(d){
    var mine=caDe("docente",d);
    unicos(mine.map(function(a){return a.asignatura;})).forEach(function(as){
      var l=caDe("asignatura",as,mine).sort(porGrupo);
      out.push([d,as,l.map(function(a){return a.grupo+" ("+a.horas+" h)";}).join(", "),String(suma(l))]);
    });
    out.push([d,"Total","",String(suma(mine))]);
  });
  return out;
}
function caMatriz(vis){
  var docs=unicos(vis.map(function(a){return a.docente;})),grupos=unicos(vis.map(function(a){return a.grupo;}));
  var h='<div class="tbl-wrap"><table class="mx"><thead><tr><th>Docente</th>'+grupos.map(function(g){return '<th>'+esc(g)+'</th>';}).join("")+'<th class="num">Total docente</th></tr></thead><tbody>';
  docs.forEach(function(d){
    var mine=caDe("docente",d,vis),tot=suma(caDe("docente",d)),e=estadoCa(tot);
    h+='<tr><th scope="row">'+esc(d)+'</th>'+grupos.map(function(g){
      var c=caDe("grupo",g,mine).sort(porAsig);
      if(!c.length)return '<td class="mxc"></td>';
      var t=suma(c);
      return '<td class="mxc" style="--h:'+Math.min(t,5)+'"><b>'+t+'</b>'+c.map(function(a){
        return '<button class="mxl" data-act="editCa" data-id="'+esc(a.id)+'" title="'+esc(a.asignatura+" · "+a.grupo+" · "+a.horas+" h · clic para editar")+'">'+esc(corta(a.asignatura))+(c.length>1?" · "+a.horas:"")+'</button>';
      }).join("")+'</td>';
    }).join("")+'<td class="num mxt '+e.c+'"><b>'+tot+'</b> / '+ca.tope+' h<span class="tag">'+e.t+'</span></td></tr>';
  });
  h+='</tbody><tfoot><tr><th scope="row">Horas por grupo</th>'+grupos.map(function(g){return '<td>'+suma(caDe("grupo",g,vis))+'</td>';}).join("")+'<td class="num">'+suma(vis)+' h</td></tr></tfoot></table></div>';
  return h;
}
function caPorDocente(vis){
  return '<div class="ca-grid">'+unicos(vis.map(function(a){return a.docente;})).map(function(d){
    var mine=caDe("docente",d,vis),tot=suma(caDe("docente",d)),e=estadoCa(tot),p=Math.min(100,Math.round(tot/ca.tope*100));
    return '<article class="ca-card"><h3>'+esc(d)+'</h3>'+
      '<div class="meter '+e.c+'"><div class="meter-top"><b>'+tot+'</b><span class="muted">/ '+ca.tope+' h semanales</span><span class="tag">'+e.t+'</span></div><div class="meter-bar"><i style="width:'+p+'%"></i></div></div>'+
      unicos(mine.map(function(a){return a.asignatura;})).map(function(as){
        var l=caDe("asignatura",as,mine).sort(porGrupo);
        return '<div class="ca-line"><div class="ca-asig">'+esc(as)+'<span>'+suma(l)+' h</span></div><div class="chips">'+l.map(function(a){
          return '<button class="gchip" data-act="editCa" data-id="'+esc(a.id)+'" title="Clic para editar">'+esc(a.grupo)+' · '+a.horas+' h</button>';
        }).join("")+'</div></div>';
      }).join("")+'</article>';
  }).join("")+'</div>';
}
function caPorGrupo(vis){
  return '<div class="ca-grid">'+unicos(vis.map(function(a){return a.grupo;})).map(function(g){
    var l=caDe("grupo",g,vis).sort(porAsig),tot=suma(caDe("grupo",g));
    return '<article class="ca-card"><div class="ca-card-head"><h3>'+esc(g)+'</h3><span class="muted">'+tot+' h semanales</span></div><div>'+l.map(function(a){
      return '<button class="ca-row" data-act="editCa" data-id="'+esc(a.id)+'" title="Clic para editar"><span>'+esc(a.asignatura)+'</span><span class="muted">'+esc(a.docente)+'</span><b>'+a.horas+' h</b></button>';
    }).join("")+'</div></article>';
  }).join("")+'</div>';
}
function caEditor(){
  var o=ui.editCa?ca.items.find(function(a){return a.id===ui.editCa;}):null;
  if(!o){ui.editCa=null;return "";}
  var c=confirmar("ca:"+o.id,"eliminar","delCa");
  return '<form class="panel" data-form="editCa" data-id="'+esc(o.id)+'"><h3>Editar carga</h3><div class="ca-new">'+
    '<div class="field"><label for="ec-doc">Docente</label><input type="text" id="ec-doc" data-k="docente" list="ca-docs" value="'+esc(o.docente)+'" required autocomplete="off"></div>'+
    '<div class="field"><label for="ec-asig">Asignatura</label><input type="text" id="ec-asig" data-k="asignatura" list="ca-asigs" value="'+esc(o.asignatura)+'" required autocomplete="off"></div>'+
    '<div class="field"><label for="ec-grupo">Grupo</label><input type="text" id="ec-grupo" data-k="grupo" value="'+esc(o.grupo)+'" required></div>'+
    '<div class="field"><label for="ec-horas">Horas</label><input type="number" id="ec-horas" data-k="horas" min="1" max="40" step="1" value="'+o.horas+'" required></div>'+
    '<button class="btn primary" type="submit">Guardar</button></div>'+
    '<div class="row">'+(c||'<button class="btn small danger" type="button" id="ec-del" data-act="ask" data-key="'+esc("ca:"+o.id)+'">Eliminar esta carga</button>')+'<button class="btn small" type="button" id="ec-cancel" data-act="cancelCa">Cancelar</button></div></form>';
}
function renderCa(){
  var body=$("ca-body");if(!body)return;
  var docs=unicos(ca.items.map(function(a){return a.docente;})),asigs=unicos(ca.items.map(function(a){return a.asignatura;})),grupos=unicos(ca.items.map(function(a){return a.grupo;}));
  var fuera=docs.filter(function(d){return suma(caDe("docente",d))!==ca.tope;}).length;
  $("tab-ca-n").textContent=docs.length?String(docs.length):"";
  $("ca-resumen").textContent=!ca.items.length?"":docs.length+" docentes · "+asigs.length+" asignaturas · "+grupos.length+" grupos · "+suma(ca.items)+" horas semanales · "+(fuera?fuera+(fuera===1?" docente no suma ":" docentes no suman ")+ca.tope+" h":"todos suman "+ca.tope+" h");
  $("ca-docs").innerHTML=docs.map(function(d){return '<option value="'+esc(d)+'"></option>';}).join("");
  $("ca-asigs").innerHTML=asigs.map(function(d){return '<option value="'+esc(d)+'"></option>';}).join("");
  var v=ui.caView||"matriz";
  ["matriz","docente","grupo"].forEach(function(k){$("cav-"+k).setAttribute("aria-pressed",String(k===v));});
  $("ca-edit").innerHTML=caEditor();
  var q=plano(ui.caFilter||"").trim();
  var vis=q?ca.items.filter(function(a){return plano(a.docente+" "+a.asignatura+" "+a.grupo).indexOf(q)>=0;}):ca.items;
  var h;
  if(!caLoaded)h='<p class="muted">Cargando cargas académicas…</p>';
  else if(!ca.items.length)h='<div class="empty"><h3>Todavía no hay cargas académicas</h3><p style="margin:0;max-width:65ch">Abrí «Agregar carga» y cargá la primera: docente, asignatura, grupo y horas semanales.</p></div>';
  else if(!vis.length)h='<p class="muted">Ninguna carga coincide con «'+esc((ui.caFilter||"").trim())+'».</p>';
  else h=v==="docente"?caPorDocente(vis):v==="grupo"?caPorGrupo(vis):caMatriz(vis);
  body.innerHTML=h;
  renderResumen();renderPendientes();
  if(ui.caFocus){var el=$(ui.caFocus);ui.caFocus=null;if(el){try{el.focus();}catch(e){}}}
}
function guardarCa(f){
  var val=function(k){var i=f.querySelector('[data-k="'+k+'"]');return i?i.value.trim():"";};
  var doc=val("docente"),as=val("asignatura"),gr=normGrupo(val("grupo")),hs=Number(val("horas"));
  if(!doc||!as||!gr||!(hs>0)){ui.msg="Completá docente, asignatura, grupo y horas.";renderTop();return;}
  baseCa();
  if(f.dataset.form==="editCa"){
    var id=f.dataset.id,o=ca.items.find(function(a){return a.id===id;});
    if(o){o.docente=doc;o.asignatura=as;o.grupo=gr;o.horas=hs;}
    ui.editCa=null;
  }else{
    ca.items.push({id:uid("c"),docente:doc,asignatura:as,grupo:gr,horas:hs});
    f.reset();
  }
  commitCa();
}
function initCa(){var v=null;try{v=localStorage.getItem(CAV_LS);}catch(e){}ui.caView=(v==="docente"||v==="grupo")?v:"matriz";}

/* ---------- Plan operativo anual (doc aparte: tablero/poa) ---------- */
var POA_LS="tablero-poa-v1",POAM_LS="tablero-poa-mes-v1";
function poaVacio(){return {anio:"",items:[],periodicas:[],notas:[]};}
var poa=poaVacio(),poaRef=null,poaDirty=false,poaSaving=false,poaTimer=null,poaLast="",poaPending=null,poaLoaded=false;
var POA_K=["semana","actividad","asistentes","hora","sede","lugar","responsables"],PER_K=["actividad","periodicidad","horario","observacion","responsable","seguimiento"];
function normPoa(d){
  d=d||{};
  var lim=function(a,ks,extra){return (Array.isArray(a)?a:[]).filter(function(x){return x&&x.id;}).map(function(x){var o={id:String(x.id)};ks.forEach(function(k){o[k]=String(x[k]||"");});if(extra)extra(o,x);return o;});};
  return {anio:String(d.anio||""),
    items:lim(d.items,POA_K,function(o,x){o.fecha=/^\d{4}-\d{2}-\d{2}$/.test(x.fecha||"")?x.fecha:"";}),
    periodicas:lim(d.periodicas,PER_K),
    notas:lim(d.notas,["mes","semana","texto"])};
}
function poaLsWrite(){try{localStorage.setItem(POA_LS,JSON.stringify(poa));}catch(e){}}
function poaLsRead(){try{var r=localStorage.getItem(POA_LS);return r?normPoa(JSON.parse(r)):null;}catch(e){return null;}}
function basePoa(){if(poaPending){poa=poaPending;poaPending=null;}}
function commitPoa(){
  renderPoa(); poaLsWrite();
  if(mode==="shared"){poaDirty=true;setStatus();clearTimeout(poaTimer);poaTimer=setTimeout(flushPoa,600);}
}
function flushPoa(){
  if(mode!=="shared"||poaSaving||!poaDirty||!poaRef)return;
  var json=JSON.stringify(poa);
  if(json===poaLast){poaDirty=false;setStatus();return;}
  poaSaving=true;poaDirty=false;setStatus();
  poaRef.set(JSON.parse(json)).then(function(){
    poaLast=json;poaSaving=false;setStatus();
    if(poaDirty)flushPoa();
  }).catch(function(e){
    poaSaving=false;
    mode=(e&&e.code==="invalid_argument")?"readonly":"local";
    ui.msg="No se pudo guardar el plan operativo de forma compartida. Los cambios quedan en este navegador.";
    render();
  });
}
function adoptPoa(data){
  var n=normPoa(data),j=JSON.stringify(n);
  if(j===JSON.stringify(poa)){poaLast=j;if(!ui.editPoa&&!ui.editPer)renderPoa();return;}
  if(ui.editPoa||ui.editPer){poaPending=n;return;}
  poa=n;poaLast=j;renderPoa();
}
function poaOrden(){
  return poa.items.slice().sort(function(a,b){
    if(a.fecha!==b.fecha){if(!a.fecha)return 1;if(!b.fecha)return -1;return a.fecha<b.fecha?-1:1;}
    return 0;
  });
}
/* "SEM 42 / ESC 34 / VAC 4 / INST 3": semana del año, semana escolar, vacaciones y desarrollo institucional */
function semanaPartes(s){
  var out={titulo:"",tags:[]},resto=[];
  String(s||"").split("/").map(function(t){return t.trim();}).filter(Boolean).forEach(function(t){
    var m=/^(SEM|ESC|VAC|INST)\s*\.?\s*(\d+)$/i.exec(t.replace(/\s+/g," "));
    if(!m){resto.push(t);return;}
    var k=m[1].toUpperCase(),n=m[2];
    if(k==="SEM")out.titulo="Semana "+n;
    else out.tags.push({c:k==="VAC"?"vac":k==="INST"?"inst":"",t:(k==="ESC"?"Escolar ":k==="VAC"?"Vacaciones ":"Institucional ")+n});
  });
  if(resto.length)out.titulo=out.titulo?out.titulo+" · "+resto.join(" · "):resto.join(" · ");
  if(!out.titulo)out.titulo="Sin semana asignada";
  return out;
}
function porDefinir(a){return /por definir/i.test(a.hora+" "+a.lugar+" "+a.responsables+" "+a.sede)||!a.responsables;}
function pd(t){return t?(/por definir/i.test(t)?'<span class="pd">'+esc(t)+'</span>':esc(t)):'<span class="pd">Sin dato</span>';}
function poaMesActual(){
  var v=ui.poaMes;if(v)return v;
  var hoy=hoyISO();
  if(poa.anio&&hoy.slice(0,4)===poa.anio&&poa.items.some(function(a){return a.fecha.slice(0,7)===hoy.slice(0,7);}))return hoy.slice(0,7);
  var prim=poaOrden().find(function(a){return a.fecha;});return prim?prim.fecha.slice(0,7):"todo";
}
function poaVisibles(){
  var q=plano(ui.poaFilter||"").trim(),mes=poaMesActual();
  return poaOrden().filter(function(a){
    if(ui.poaPend==="pend"&&!porDefinir(a))return false;
    if(q)return plano([a.actividad,a.asistentes,a.responsables,a.lugar,a.sede,a.hora,a.semana,diaNombre(a.fecha),fechaLarga(a.fecha)].join(" ")).indexOf(q)>=0;
    return mes==="todo"||a.fecha.slice(0,7)===mes;
  });
}
function poaFila(a,next,hoy){
  var d=fechaObj(a.fecha);
  if(ui.editPoa===a.id){
    var c=confirmar("poa:"+a.id,"eliminar","delPoa"),id=esc(a.id);
    var f=function(k,l,t,wide){return '<div class="field'+(wide?" wide":"")+'"><label for="ep-'+k+'-'+id+'">'+l+'</label><input type="'+(t||"text")+'" id="ep-'+k+'-'+id+'" data-k="'+k+'" value="'+esc(a[k])+'"'+(k==="actividad"||k==="fecha"?" required":"")+'></div>';};
    return '<form class="poa-edit" data-form="editPoa" data-id="'+id+'"><div class="poa-form">'+f("fecha","Fecha","date")+f("semana","Semana")+f("actividad","Actividad","text",true)+f("asistentes","Asistentes")+f("hora","Hora")+f("sede","Sede")+f("lugar","Medio o lugar")+f("responsables","Responsables")+'</div>'+
      '<div class="row"><button class="btn small primary" type="submit">Guardar</button><button class="btn small" type="button" data-act="cancelPoa" data-id="'+id+'">Cancelar</button>'+(c||'<button class="btn small danger" type="button" id="dp-'+id+'" data-act="ask" data-key="'+esc("poa:"+a.id)+'">Eliminar</button>')+'</div></form>';
  }
  var lugar=[a.sede,a.lugar].filter(Boolean).filter(function(v,i,arr){return arr.indexOf(v)===i;});
  return '<div class="poa-row'+(a.fecha&&a.fecha<hoy?" past":"")+(next?" next":"")+'">'+
    '<div class="poa-date"><b>'+(d?d.getDate():"—")+'</b><span>'+esc(diaNombre(a.fecha).slice(0,3))+'</span></div>'+
    '<div class="poa-act"><span>'+esc(a.actividad)+'</span>'+(next?'<span class="tag next-tag">Próxima</span>':'')+'<span class="poa-sub">'+(a.hora?esc(a.hora):'<span class="pd">Hora sin dato</span>')+'</span></div>'+
    '<div><span class="lbl">Asistentes</span>'+pd(a.asistentes)+'</div>'+
    '<div><span class="lbl">Lugar</span>'+(lugar.length?lugar.map(pd).join(" · "):pd(""))+'</div>'+
    '<div><span class="lbl">Responsables</span>'+pd(a.responsables)+'</div>'+
    '<button class="btn small" id="epb-'+esc(a.id)+'" data-act="editPoa" data-id="'+esc(a.id)+'">Editar</button></div>';
}
function poaTablas(){
  var mes=poaMesActual(),d=mes==="todo"?null:fechaObj(mes+"-01");
  var items=poaOrden().filter(function(a){return mes==="todo"||a.fecha.slice(0,7)===mes;});
  return [
    {titulo:("Plan Operativo Anual "+poa.anio+(d?" · "+mayus(MESES[d.getMonth()]):"")).trim(),cols:["Fecha","Semana","Actividad","Asistentes","Hora","Sede y lugar","Responsables"],anchos:[1500,1300,3300,2200,1500,1772,2000],texto:true,vacio:"(Sin actividades)",
     filas:items.map(function(a){return [mayus(diaNombre(a.fecha))+" "+fechaLarga(a.fecha),a.semana||"—",a.actividad,a.asistentes||"—",a.hora||"—",[a.sede,a.lugar].filter(Boolean).join(" · ")||"—",a.responsables||"—"];})},
    {titulo:"Actividades periódicas",cols:["Actividad","Periodicidad","Horario","Observación","Responsable","Seguimiento"],anchos:[3300,1800,1800,2900,2272,1500],texto:true,vacio:"(Sin actividades periódicas)",
     filas:poa.periodicas.map(function(p){return [p.actividad,p.periodicidad||"—",p.horario||"—",p.observacion||"—",p.responsable||"—",p.seguimiento||"—"];})}
  ];
}
function renderPoaKpis(mes){
  var hoy=hoyISO(),h7=new Date();h7.setDate(h7.getDate()+7);
  var p=function(n){return (n<10?"0":"")+n;},lim=h7.getFullYear()+"-"+p(h7.getMonth()+1)+"-"+p(h7.getDate());
  var dm=mes==="todo"?null:fechaObj(mes+"-01");
  var enMes=poa.items.filter(function(a){return mes==="todo"||a.fecha.slice(0,7)===mes;});
  var sem=poa.items.filter(function(a){return a.fecha>=hoy&&a.fecha<=lim;}).length;
  var pend=enMes.filter(porDefinir).length;
  var t=function(cls,n,l){return '<div class="stat '+cls+'"><b>'+n+'</b><span>'+l+'</span></div>';};
  $("poa-kpis").innerHTML=t("",poa.items.length,"Actividades en "+(poa.anio||"el año"))+t("cont",enMes.length,dm?"En "+MESES[dm.getMonth()]:"En todo el año")+
    t("in",sem,"En los próximos 7 días")+t(pend?"warn":"",pend,"Con datos por definir"+(dm?" en "+MESES[dm.getMonth()]:""))+t("",poa.periodicas.length,"Actividades periódicas");
}
function renderPoa(){
  var list=$("poa-list");if(!list)return;
  var n=poa.items.length,hoy=hoyISO(),mes=poaMesActual(),q=(ui.poaFilter||"").trim();
  $("tab-poa-n").textContent=n?String(n):"";
  $("poa-titulo").textContent=("Plan Operativo Anual "+poa.anio).trim();
  ["todas","pend"].forEach(function(k){$("poap-"+k).setAttribute("aria-pressed",String((ui.poaPend||"todas")===k));});
  var orden=poaOrden(),prox=orden.find(function(a){return a.fecha&&a.fecha>=hoy;})||null;
  $("poa-resumen").textContent=!n?"":(prox?"Próxima: "+prox.actividad+" · "+diaNombre(prox.fecha)+" "+fechaLarga(prox.fecha):"Sin actividades próximas");
  /* selector de meses con conteo; el mes en curso lleva un borde */
  var cuenta={};poa.items.forEach(function(a){var k=a.fecha.slice(0,7);cuenta[k]=(cuenta[k]||0)+1;});
  var anio=poa.anio||(orden[0]&&orden[0].fecha.slice(0,4))||hoy.slice(0,4);
  $("poa-meses").innerHTML=MESES.map(function(m,i){
    var k=anio+"-"+(i<9?"0":"")+(i+1),c=cuenta[k]||0;
    return '<button class="mesb'+(k===hoy.slice(0,7)?" hoy":"")+'" id="pm-'+k+'" data-act="poaMes" data-v="'+k+'" aria-pressed="'+(!q&&mes===k)+'"'+(c?"":" disabled")+'>'+mayus(m.slice(0,3))+'<span class="c">'+c+'</span></button>';
  }).join("")+'<button class="mesb" id="pm-todo" data-act="poaMes" data-v="todo" aria-pressed="'+(!q&&mes==="todo")+'">Año<span class="c">'+n+'</span></button>';
  renderPoaKpis(mes);
  var vis=poaVisibles(),h;
  if(!poaLoaded)h='<p class="muted">Cargando plan operativo…</p>';
  else if(!n)h='<div class="empty"><h3>Todavía no hay plan operativo</h3><p style="margin:0;max-width:65ch">Abrí «Agregar actividad al plan» y cargá la primera: fecha, semana, actividad, asistentes, hora, sede, lugar y responsables.</p></div>';
  else if(!vis.length)h='<p class="muted">'+(q?'Ninguna actividad del año coincide con «'+esc(q)+'».':'No hay actividades'+(ui.poaPend==="pend"?" con datos por definir":"")+' en este mes.')+'</p>';
  else{
    var meses=[],m=null;
    vis.forEach(function(a){var k=a.fecha.slice(0,7);if(!m||m.k!==k){m={k:k,weeks:[]};meses.push(m);}var w=m.weeks[m.weeks.length-1];if(!w||w.s!==a.semana){w={s:a.semana,items:[]};m.weeks.push(w);}w.items.push(a);});
    var cols='<div class="poa-cols" aria-hidden="true"><span>Día</span><span>Actividad y hora</span><span>Asistentes</span><span>Sede y lugar</span><span>Responsables</span><span></span></div>';
    h=(q?'<p class="muted" style="margin:0">'+vis.length+(vis.length===1?" resultado":" resultados")+' en todo el año para «'+esc(q)+'».</p>':'')+meses.map(function(mm){
      var d=fechaObj(mm.k+"-01"),notas=q?[]:poa.notas.filter(function(x){return x.mes===mm.k;});
      return '<div class="month"><div class="month-head"><h3>'+(d?esc(mayus(MESES[d.getMonth()])+" "+d.getFullYear()):"Sin fecha")+'</h3><span class="muted">'+mm.weeks.reduce(function(t,w){return t+w.items.length;},0)+'</span></div>'+
        (notas.length?'<div class="hitos"><strong>Hitos del mes</strong>'+notas.map(function(x){return '<p>'+(x.semana?'<span class="muted">'+esc(semanaPartes(x.semana).titulo)+' · </span>':'')+esc(x.texto)+'</p>';}).join("")+'</div>':'')+
        mm.weeks.map(function(w){
          var sp=semanaPartes(w.s);
          return '<div class="week"><div class="week-head"><h4>'+esc(sp.titulo)+'</h4>'+sp.tags.map(function(t){return '<span class="wt '+t.c+'">'+esc(t.t)+'</span>';}).join("")+'<span class="muted">'+w.items.length+(w.items.length===1?" actividad":" actividades")+'</span></div>'+cols+
            w.items.map(function(a){return poaFila(a,!!prox&&prox.id===a.id,hoy);}).join("")+'</div>';
        }).join("")+'</div>';
    }).join("");
  }
  list.innerHTML=h;
  renderPer();
  if(ui.poaFocus){var el=$(ui.poaFocus);ui.poaFocus=null;if(el){try{el.focus({preventScroll:true});}catch(e){}}}
}
function renderPer(){
  var box=$("per-list");if(!box)return;
  $("per-resumen").textContent=poa.periodicas.length?poa.periodicas.length+" actividades · clic en una fila para editarla":"";
  var o=ui.editPer?poa.periodicas.find(function(p){return p.id===ui.editPer;}):null;
  if(!o)ui.editPer=null;
  if(o){
    var c=confirmar("per:"+o.id,"eliminar","delPer"),id=esc(o.id);
    var f=function(k,l,wide){return '<div class="field'+(wide?" wide":"")+'"><label for="er-'+k+'">'+l+'</label><input type="text" id="er-'+k+'" data-k="'+k+'" value="'+esc(o[k])+'"'+(k==="actividad"?" required":"")+'></div>';};
    $("per-edit").innerHTML='<form class="panel" data-form="editPer" data-id="'+id+'"><h3>Editar actividad periódica</h3><div class="poa-form">'+f("actividad","Actividad",true)+f("periodicidad","Periodicidad")+f("horario","Horario")+f("responsable","Responsable")+f("observacion","Observación",true)+f("seguimiento","Seguimiento")+'</div>'+
      '<div class="row"><button class="btn small primary" type="submit">Guardar</button><button class="btn small" type="button" data-act="cancelPer">Cancelar</button>'+(c||'<button class="btn small danger" type="button" id="dr-'+id+'" data-act="ask" data-key="'+esc("per:"+o.id)+'">Eliminar</button>')+'</div></form>';
  }else $("per-edit").innerHTML="";
  if(!poa.periodicas.length){box.innerHTML=poaLoaded?'<p class="muted">Sin actividades periódicas.</p>':'';return;}
  box.innerHTML='<div class="tbl-wrap"><table><thead><tr><th>Actividad</th><th>Periodicidad</th><th>Horario</th><th>Observación</th><th>Responsable</th><th>Seguimiento</th></tr></thead><tbody>'+
    poa.periodicas.map(function(p){return '<tr data-act="editPer" data-id="'+esc(p.id)+'" tabindex="0" title="Clic para editar"><td>'+esc(p.actividad)+'</td><td>'+pd(p.periodicidad)+'</td><td>'+pd(p.horario)+'</td><td>'+(p.observacion?esc(p.observacion):'<span class="muted">—</span>')+'</td><td>'+pd(p.responsable)+'</td><td>'+(p.seguimiento?esc(p.seguimiento):'<span class="muted">—</span>')+'</td></tr>';}).join("")+
    '</tbody></table></div>';
}
function guardarPoa(f){
  var val=function(k){var i=f.querySelector('[data-k="'+k+'"]');return i?i.value.trim():"";};
  var form=f.dataset.form;
  if(form==="newPer"||form==="editPer"){
    var p={};PER_K.forEach(function(k){p[k]=val(k);});
    if(!p.actividad){ui.msg="Poné el nombre de la actividad periódica.";renderTop();return;}
    basePoa();
    if(form==="editPer"){var o=poa.periodicas.find(function(x){return x.id===f.dataset.id;});if(o)PER_K.forEach(function(k){o[k]=p[k];});ui.editPer=null;}
    else{p.id=uid("r");poa.periodicas.push(p);f.reset();}
    commitPoa();return;
  }
  var a={fecha:val("fecha")};POA_K.forEach(function(k){a[k]=val(k);});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)||!a.actividad){ui.msg="Poné la fecha y el nombre de la actividad.";renderTop();return;}
  basePoa();
  if(!poa.anio)poa.anio=a.fecha.slice(0,4);
  if(form==="editPoa"){
    var id=f.dataset.id,x=poa.items.find(function(q){return q.id===id;});
    if(x){x.fecha=a.fecha;POA_K.forEach(function(k){x[k]=a[k];});}
    ui.editPoa=null;ui.poaFocus="epb-"+id;
  }else{
    a.id=uid("p");poa.items.push(a);f.reset();
    var sd=$("po-sede");if(sd)sd.value="Central I.E.M.F";
    ui.poaMes=a.fecha.slice(0,7);
  }
  commitPoa();
}
function initPoa(){var v=null;try{v=localStorage.getItem(POAM_LS);}catch(e){}if(v&&/^(\d{4}-\d{2}|todo)$/.test(v))ui.poaMes=v;}

function setTema(t,save){
  var claro=t==="claro";
  if(claro)document.documentElement.setAttribute("data-tema","claro");else document.documentElement.removeAttribute("data-tema");
  $("btn-tema").textContent=claro?"Modo oscuro":"Modo claro";
  if(save){try{localStorage.setItem(TEMA_LS,claro?"claro":"oscuro");}catch(e){}}
}
function initTema(){var t=null;try{t=localStorage.getItem(TEMA_LS);}catch(e){}setTema(t,false);}
function initTab(){
  var t=null;
  if(location.hash==="#actividades")t="act";
  else if(location.hash==="#direcciones")t="dg";
  else if(location.hash==="#cargas")t="ca";
  else if(location.hash==="#poa")t="poa";
  else{try{t=localStorage.getItem(TAB_LS);}catch(e){}}
  setTab(t,false);
}

/* ---------- Render ---------- */
function confirmar(key,label,actYes){
  if(ui.confirm===key)return '<span class="row"><button class="btn small danger" data-act="'+actYes+'" data-key="'+esc(key)+'">Sí, '+label+'</button><button class="btn small" data-act="cancel">Cancelar</button></span>';
  return null;
}
function renderTop(){
  setStatus();
  var h="";
  if(mode==="local"&&ui.conexion==="sinCuenta"){
    h+='<div class="notice"><p><strong>Iniciá sesión en Claude para ver la información del portal.</strong> Proyectos, actividades, direcciones de grupo, cargas y POA se comparten solo con quienes entran con su cuenta. Sin sesión, lo que veas o cargues queda únicamente en este navegador y nadie más lo ve. Iniciá sesión en claude.ai y volvé a abrir este enlace.</p></div>';
  }else if(mode==="local"&&ui.conexion==="error"){
    h+='<div class="notice"><p><strong>No se pudo conectar con la información compartida.</strong> Recargá la página. Mientras tanto, lo que cargues queda solo en este navegador.</p></div>';
  }
  if(state.esEjemplo){
    var c=confirmar("ejemplo","vaciar","clearAll");
    h+='<div class="notice"><p><strong>Datos de ejemplo</strong> — reemplazalos por los reales.</p>'+(c||'<span class="row"><button class="btn small" id="btn-vaciar-ej" data-act="ask" data-key="ejemplo">Vaciar ejemplo</button><button class="btn small ghost" id="btn-son-mios" data-act="keep">Ya son mis datos</button></span>')+'</div>';
  }
  if(ui.msg){
    h+='<div class="msg" role="status"><div class="row" style="justify-content:space-between"><span>'+esc(ui.msg)+'</span><button class="btn small" data-act="dismiss">Cerrar</button></div>'+
      (ui.copyText?'<textarea id="copy-area" readonly aria-label="Tablas en texto">'+esc(ui.copyText)+'</textarea>':'')+'</div>';
  }
  $("mensajes").innerHTML=h;
  $("mensajes").style.cssText=h?"display:flex;flex-direction:column;gap:12px":"display:none";
}
function renderResumen(){
  $("tab-proy-n").textContent=state.proyectos.length?String(state.proyectos.length):"";
  var c=0,s=0,i=0,vac=0,enProx={};
  state.proyectos.forEach(function(p){var q=partes(p);c+=q.cont.length;s+=q.sale.length;i+=q.ingresa.length;if(!p.proximo.length)vac++;p.proximo.forEach(function(d){enProx[d]=1;});});
  var sinN=state.docentes.filter(function(d){return !enProx[d.id];}).map(function(d){return d.nombre;}).sort(cmp).concat(externosSinProyecto()),sin=sinN.length;
  var vacN=state.proyectos.filter(function(p){return !p.proximo.length;}).map(function(p){return p.nombre||"(Proyecto sin nombre)";});
  /* los indicadores de pendientes nombran a quiénes cuentan, para no tener que buscarlos */
  var cuales=function(l){return l.length?'<small>'+esc(l.slice(0,4).join(" · "))+(l.length>4?" y "+(l.length-4)+" más":"")+'</small>':'<small>Ninguno</small>';};
  var t=function(cls,n,l,extra){return '<div class="stat '+cls+'">'+(extra||"")+'<b>'+n+'</b><span>'+l+'</span></div>';};
  $("resumen").innerHTML=t("",state.proyectos.length,"Proyectos")+t("",state.docentes.length,"Docentes")+
    t("cont",c,"Continúan en "+esc(state.anioProximo))+t("in",i,"Ingresan en "+esc(state.anioProximo))+t("out",s,"Salen al cerrar "+esc(state.anioActual))+
    t(sin?"warn":"",sin,"Docentes sin proyecto en "+esc(state.anioProximo),cuales(sinN))+t(vac?"warn":"",vac,"Proyectos sin integrantes en "+esc(state.anioProximo),cuales(vacN));
}
/* el mismo docente aparece en direcciones y cargas con o sin segundo nombre o apellido, y a veces con otra grafía (Gladys/Gladis): se compara por palabras */
function tokensNombre(n){return plano(n).replace(/[^a-z\s]/g," ").split(/\s+/).filter(function(t){return t.length>2&&t!=="maria"&&t!=="del"&&t!=="las"&&t!=="los";});}
function casiIgual(a,b){
  if(a===b)return true;
  if(a.length<5||b.length<5||Math.abs(a.length-b.length)>1)return false;
  var i=0,j=0,e=0;
  while(i<a.length&&j<b.length){
    if(a[i]===b[j]){i++;j++;continue;}
    if(++e>1)return false;
    if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}
  }
  return e+(a.length-i)+(b.length-j)<=1;
}
function mismoDocente(a,b){
  var ta=tokensNombre(a),tb=tokensNombre(b);
  var n=ta.filter(function(t){return tb.some(function(u){return casiIgual(t,u);});}).length;
  return n>0&&n>=Math.min(2,ta.length,tb.length);
}
/* personal registrado en Direcciones de grupo o Cargas académicas que no figura en ningún proyecto (ninguno de los dos años) */
function externosSinProyecto(){
  var vistos=[],ext=[];
  dg.items.map(function(a){return a.docente;}).concat(ca.items.map(function(a){return a.docente;})).forEach(function(n){
    n=String(n||"").trim();if(!n)return;
    if(vistos.some(function(v){return mismoDocente(v,n);}))return;
    vistos.push(n);
    if(!state.docentes.some(function(d){return mismoDocente(d.nombre,n);}))ext.push(n);
  });
  return ext.sort(cmp);
}
function renderPendientes(){
  var body=$("pend-body");if(!body)return;
  var col=ui.pendCol==="actual"?"actual":"proximo",anio=col==="actual"?state.anioActual:state.anioProximo;
  $("pend-anios").innerHTML=[["actual",state.anioActual],["proximo",state.anioProximo]].map(function(o){
    return '<button class="segb" id="pa-'+o[0]+'" data-act="pendCol" data-v="'+o[0]+'" aria-pressed="'+(o[0]===col)+'">'+esc(o[1])+'</button>';
  }).join("");
  var vacios=state.proyectos.filter(function(p){return !p[col].length;});
  var en={};state.proyectos.forEach(function(p){p[col].forEach(function(d){en[d]=1;});});
  var sinP=state.docentes.filter(function(d){return !en[d.id];}).sort(function(a,b){return cmp(a.nombre,b.nombre);});
  var ext=externosSinProyecto(),nDoc=sinP.length+ext.length;
  var card=function(n,titulo,inner){return '<div class="pend '+(n?"warn":"ok")+'"><div class="pend-head"><h3>'+titulo+'</h3><b>'+n+'</b></div>'+inner+'</div>';};
  var h1=vacios.length?'<div class="chips">'+vacios.map(function(p){
      return '<button class="pend-item" data-act="irProj" data-pid="'+esc(p.id)+'" id="pi-'+esc(p.id)+'" title="Ir al proyecto en el tablero">'+esc(p.nombre||"(Proyecto sin nombre)")+'</button>';
    }).join("")+'</div>':'<p class="pend-ok">Todos los proyectos tienen integrantes en '+esc(anio)+'.</p>';
  var h2=sinP.length?'<div class="chips">'+sinP.map(function(d){
      return '<button class="pend-item" data-act="irDoc" data-did="'+esc(d.id)+'" id="pd-'+esc(d.id)+'" title="Ver en ¿Dónde estoy?">'+esc(d.nombre)+'</button>';
    }).join("")+'</div>':'<p class="pend-ok">Los '+state.docentes.length+' docentes de la lista tienen al menos un proyecto en '+esc(anio)+'.</p>';
  if(ext.length)h2+='<p class="pend-sub">En direcciones de grupo o cargas, sin ningún proyecto</p><div class="chips">'+ext.map(function(n){return '<span class="pend-item ext">'+esc(n)+'</span>';}).join("")+'</div>';
  body.innerHTML=card(vacios.length,"Proyectos sin integrantes en "+esc(anio),h1)+card(nDoc,"Docentes sin proyecto en "+esc(anio),h2);
}
function chip(cls,pid,did,tag,act,title,col){
  var me=ui.sel===did?" me":"";
  return '<span class="chip '+cls+me+'"><button class="chip-main" data-act="'+act+'" data-pid="'+pid+'" data-did="'+did+'" id="c-'+col+'-'+pid+'-'+did+'" title="'+esc(title)+'"><span class="nm">'+esc(nombre(did))+'</span>'+(tag?'<span class="tag">'+tag+'</span>':'')+'</button>'+
    (col==="s"?'<span style="width:10px"></span>':'<button class="chip-x" data-act="rm" data-col="'+col+'" data-pid="'+pid+'" data-did="'+did+'" id="x-'+col+'-'+pid+'-'+did+'" aria-label="Quitar a '+esc(nombre(did))+' de '+esc(col==="a"?state.anioActual:state.anioProximo)+'">×</button>')+'</span>';
}
function addUI(pid,col){
  if(ui.adding&&ui.adding.pid===pid&&ui.adding.col===col){
    var p=proy(pid),ya=col==="a"?p.actual:p.proximo;
    var opts=state.docentes.filter(function(d){return ya.indexOf(d.id)<0;}).sort(function(a,b){return cmp(a.nombre,b.nombre);}).map(function(d){return '<option value="'+esc(d.nombre)+'"></option>';}).join("");
    return '<form class="add-form" data-form="add" data-pid="'+pid+'" data-col="'+col+'"><input type="text" id="add-'+col+'-'+pid+'" list="dl-'+col+'-'+pid+'" placeholder="Elegí o escribí un nombre" aria-label="Docente a agregar" autocomplete="off"><datalist id="dl-'+col+'-'+pid+'">'+opts+'</datalist><button class="btn small primary" type="submit">Agregar</button><button class="btn small" type="button" data-act="closeAdd">Listo</button></form>';
  }
  return '<div><button class="btn small ghost" id="open-'+col+'-'+pid+'" data-act="openAdd" data-pid="'+pid+'" data-col="'+col+'">+ Agregar docente</button></div>';
}
function renderBoard(){
  if(!state.proyectos.length){
    $("board").innerHTML='<div class="empty"><h3>Todavía no hay proyectos</h3><ol><li>Escribí el nombre del primer proyecto y agregalo.</li><li>Sumá los docentes que lo integran en '+esc(state.anioActual)+'.</li><li>En la reunión, definí quién continúa, quién sale y quién ingresa en '+esc(state.anioProximo)+'.</li></ol>'+
      '<form data-form="newProj"><input type="text" id="np-empty" placeholder="Nombre del proyecto" aria-label="Nombre del proyecto"><button class="btn primary" type="submit">Agregar proyecto</button></form></div>';
    return;
  }
  var fq=plano(ui.pFilter||"").trim(),fc=ui.pCon||"todos";
  var lista=proyOrden().filter(function(p){
    var n=p.actual.length+p.proximo.length;
    if(fc==="con"&&!n)return false;
    if(fc==="sin"&&n)return false;
    if(!fq)return true;
    return plano(p.nombre+" "+p.actual.concat(p.proximo).map(nombre).join(" ")).indexOf(fq)>=0;
  });
  ["todos","con","sin"].forEach(function(k){$("pc-"+k).setAttribute("aria-pressed",String(k===fc));});
  $("pf-n").textContent=lista.length===state.proyectos.length?state.proyectos.length+" proyectos":lista.length+" de "+state.proyectos.length+" proyectos";
  if(!lista.length){
    $("board").innerHTML='<p class="muted" style="margin:0">Ningún proyecto coincide'+(fq?' con «'+esc((ui.pFilter||"").trim())+'»':'')+(fc==="con"?' entre los que tienen docentes':fc==="sin"?' entre los que no tienen docentes':'')+'.</p>';
    return;
  }
  $("board").innerHTML=lista.map(function(p){
    var q=partes(p),sel=ui.sel,in_=sel&&(p.actual.indexOf(sel)>=0||p.proximo.indexOf(sel)>=0);
    var a=ordenar(p.actual).map(function(d){var cont=p.proximo.indexOf(d)>=0;return chip(cont?"":"leaving",p.id,d,"", "toggle",cont?"Clic: marcar que sale en "+state.anioProximo:"Clic: marcar que continúa en "+state.anioProximo,"a");}).join("");
    var b=q.cont.map(function(d){return chip("cont",p.id,d,"Continúa","noop","Continúa","p");}).join("")+
          q.ingresa.map(function(d){return chip("in",p.id,d,"+ Ingresa","noop","Ingresa","p");}).join("")+
          q.sale.map(function(d){return chip("out",p.id,d,"Sale","toggle","Clic: vuelve a continuar","s");}).join("");
    var delta='<span class="delta">'+p.actual.length+' → '+p.proximo.length+' integrantes</span>';
    var head=ui.editProj===p.id?
      '<form class="rename-form" data-form="renameProj" data-pid="'+p.id+'"><input type="text" id="rp-'+p.id+'" value="'+esc(p.nombre)+'" aria-label="Nombre del proyecto" autocomplete="off" required><button class="btn small primary" type="submit">Guardar</button><button class="btn small" type="button" data-act="cancelProj" data-pid="'+p.id+'">Cancelar</button></form>'+delta:
      '<div class="proj-title"><h3>'+esc(p.nombre||"(Proyecto sin nombre)")+'</h3></div><div class="proj-meta">'+delta+'<button class="btn small" id="rnb-'+p.id+'" data-act="editProj" data-pid="'+p.id+'">Renombrar</button></div>';
    return '<article class="proj'+(sel?(in_?" hit":" dim"):"")+(ui.nuevo===p.id?" nuevo":"")+'" id="pr-'+p.id+'"><div class="proj-head">'+head+'</div>'+
      '<div class="lanes"><div class="lane"><div class="lane-title"><strong>'+esc(state.anioActual)+'</strong><span class="muted">'+p.actual.length+'</span></div><div class="chips">'+(a||'<span class="empty-lane">Sin integrantes</span>')+'</div>'+addUI(p.id,"a")+'</div>'+
      '<div class="lane-arrow" aria-hidden="true">→</div>'+
      '<div class="lane"><div class="lane-title"><strong>'+esc(state.anioProximo)+'</strong><span class="muted">'+p.proximo.length+'</span></div><div class="chips">'+(b||'<span class="empty-lane">Sin integrantes definidos</span>')+'</div>'+addUI(p.id,"p")+'</div></div></article>';
  }).join("");
}
function renderWho(){
  if(!state.docentes.length){$("who").innerHTML='<p class="muted">Cuando agregues docentes a un proyecto van a aparecer acá.</p>';return;}
  var ds=state.docentes.slice().sort(function(a,b){return cmp(a.nombre,b.nombre);});
  var people=ds.map(function(d){
    var n=state.proyectos.filter(function(p){return p.proximo.indexOf(d.id)>=0;}).length;
    return '<button class="person'+(n?"":" none")+'" id="per-'+d.id+'" data-act="sel" data-did="'+d.id+'" aria-pressed="'+(ui.sel===d.id)+'" title="'+n+' proyecto(s) en '+esc(state.anioProximo)+'">'+esc(d.nombre)+'<span class="n">'+n+'</span></button>';
  }).join("");
  var card;
  if(!ui.sel||!state.docentes.some(function(d){return d.id===ui.sel;})){
    card='<div class="card" style="border-style:dashed;border-color:var(--line)"><p class="muted" style="margin:0">Ningún docente elegido. El número junto a cada nombre es la cantidad de proyectos en '+esc(state.anioProximo)+'; el borde ámbar marca a quien quedó sin proyecto.</p></div>';
  }else{
    var id=ui.sel,act=[],prox=[],cam=[];
    state.proyectos.forEach(function(p){
      var a=p.actual.indexOf(id)>=0,b=p.proximo.indexOf(id)>=0,n=esc(p.nombre);
      if(a)act.push('<li>'+n+'</li>'); if(b)prox.push('<li>'+n+'</li>');
      if(a&&b)cam.push('<li class="t-cont"><strong>Continúa</strong> en '+n+'</li>');
      else if(a)cam.push('<li class="t-out"><strong>Sale</strong> de '+n+'</li>');
      else if(b)cam.push('<li class="t-in"><strong>Ingresa</strong> a '+n+'</li>');
    });
    var none='<li class="muted">Ninguno</li>';
    card='<div class="card"><div class="sec-head"><h3>'+esc(nombre(id))+'</h3><button class="btn small" data-act="sel" data-did="'+id+'" id="btn-quitar-sel">Quitar selección</button></div><dl>'+
      '<div><dt>'+esc(state.anioActual)+'</dt><dd><ul>'+(act.join("")||none)+'</ul></dd></div>'+
      '<div><dt>'+esc(state.anioProximo)+'</dt><dd><ul>'+(prox.join("")||'<li class="t-out"><strong>Sin proyecto asignado</strong></li>')+'</ul></dd></div>'+
      '<div><dt>Cambios</dt><dd><ul>'+(cam.join("")||none)+'</ul></dd></div></dl></div>';
  }
  $("who").innerHTML='<div class="people">'+people+'</div>'+card;
}
function renderTablas(){
  $("tablas-body").innerHTML=tablas("proy").map(function(t){
    var last=t.texto?-1:t.cols.length-1;
    return '<div><h3 style="margin-bottom:10px">'+esc(t.titulo)+'</h3><div class="tbl-wrap"><table><thead><tr>'+t.cols.map(function(c,i){return '<th'+(i===last?' class="num"':'')+'>'+esc(c)+'</th>';}).join("")+'</tr></thead><tbody>'+
      (t.filas.length?t.filas.map(function(f){return '<tr>'+f.map(function(c,i){return '<td'+(i===last?' class="num"':'')+'>'+esc(c)+'</td>';}).join("")+'</tr>';}).join(""):'<tr><td colspan="'+t.cols.length+'" class="muted">'+(t.texto?"Sin actividades todavía.":"Sin proyectos todavía.")+'</td></tr>')+'</tbody></table></div></div>';
  }).join("");
}
function renderManage(){
  var item=function(kind,o){
    var key=kind+":"+o.id,c=confirmar(key,"eliminar","del");
    return '<div class="row"><input type="text" id="rn-'+kind+'-'+o.id+'" data-rename="'+kind+'" data-id="'+o.id+'" value="'+esc(o.nombre)+'" aria-label="Nombre">'+(c||'<button class="btn small danger" id="del-'+kind+'-'+o.id+'" data-act="ask" data-key="'+esc(key)+'">Eliminar</button>')+'</div>';
  };
  var cc=confirmar("copyYear","copiar","copyYear"),ca=confirmar("todo","vaciar todo","clearAll");
  $("manage").innerHTML=
    '<div class="panel"><h3>Datos generales</h3>'+
      '<div class="field"><label for="f-inst">Institución educativa</label><input type="text" id="f-inst" data-field="institucion" value="'+esc(state.institucion)+'" placeholder="Nombre de la institución"></div>'+
      '<div class="row"><div class="field" style="flex:1 1 110px"><label for="f-y1">Año actual</label><input type="text" id="f-y1" data-field="anioActual" value="'+esc(state.anioActual)+'"></div>'+
      '<div class="field" style="flex:1 1 110px"><label for="f-y2">Año próximo</label><input type="text" id="f-y2" data-field="anioProximo" value="'+esc(state.anioProximo)+'"></div></div>'+
      '<div><p class="muted" style="margin:0 0 8px">Punto de partida: todos continúan en sus proyectos y después se ajusta.</p>'+(cc||'<button class="btn small" id="btn-copy-year" data-act="ask" data-key="copyYear">Copiar '+esc(state.anioActual)+' a '+esc(state.anioProximo)+'</button>')+'</div>'+
      '<div>'+(ca||'<button class="btn small danger" id="btn-clear-all" data-act="ask" data-key="todo">Vaciar todo</button>')+'</div></div>'+
    '<div class="panel"><h3>Proyectos</h3><form class="row" data-form="newProj"><input type="text" id="np-manage" placeholder="Nuevo proyecto" aria-label="Nuevo proyecto"><button class="btn small primary" type="submit">Agregar</button></form><div class="list">'+
      (proyOrden().map(function(p){return item("proj",p);}).join("")||'<span class="muted">Sin proyectos.</span>')+'</div></div>'+
    '<div class="panel"><h3>Docentes</h3><form class="row" data-form="newDoc"><input type="text" id="nd-manage" placeholder="Nuevo docente" aria-label="Nuevo docente"><button class="btn small primary" type="submit">Agregar</button></form><div class="list">'+
      (state.docentes.slice().sort(function(a,b){return cmp(a.nombre,b.nombre);}).map(function(d){return item("doc",d);}).join("")||'<span class="muted">Sin docentes.</span>')+'</div></div>';
}
function render(){
  var a=document.activeElement,fid=ui.focus||(a&&a.id)||null;ui.focus=null;
  renderTop();renderResumen();renderPendientes();renderBoard();renderWho();renderTablas();renderManage();
  if(fid){var el=$(fid);if(el&&el!==document.activeElement){try{el.focus({preventScroll:true});}catch(e){}}}
}

/* ---------- Acciones ---------- */
function docentePorNombre(n,crear){
  var k=n.trim().toLowerCase();if(!k)return null;
  var d=state.docentes.find(function(x){return x.nombre.trim().toLowerCase()===k;});
  if(!d&&crear){d={id:uid("d"),nombre:n.trim()};state.docentes.push(d);}
  return d||null;
}
function quitar(arr,v){var i=arr.indexOf(v);if(i>=0)arr.splice(i,1);}
document.addEventListener("click",function(ev){
  var b=ev.target.closest("[data-act]");if(!b)return;
  var act=b.dataset.act,p=b.dataset.pid?proy(b.dataset.pid):null,did=b.dataset.did;
  switch(act){
    case "noop":return;
    case "tab":setTab(b.dataset.tab,true);return;
    case "pCon":ui.pCon=b.dataset.v;renderBoard();return;
    case "pendCol":ui.pendCol=b.dataset.v;renderPendientes();return;
    case "irProj":
      /* se limpian filtros para que el proyecto quede visible, se resalta un momento y se lleva a la vista */
      var ip=b.dataset.pid;ui.pFilter="";ui.pCon="todos";var pf2=$("p-filtro");if(pf2)pf2.value="";
      ui.nuevo=ip;renderBoard();var pe2=$("pr-"+ip);if(pe2&&pe2.scrollIntoView){try{pe2.scrollIntoView({behavior:"smooth",block:"center"});}catch(e){}}
      setTimeout(function(){if(ui.nuevo===ip){ui.nuevo=null;renderBoard();}},2500);return;
    case "irDoc":ui.sel=did;render();var wd=$("docentes");if(wd&&wd.scrollIntoView){try{wd.scrollIntoView({behavior:"smooth",block:"start"});}catch(e){}}return;
    case "poaMes":ui.poaMes=b.dataset.v;ui.poaFilter="";var pff=$("poa-filtro");if(pff)pff.value="";try{localStorage.setItem(POAM_LS,ui.poaMes);}catch(e){}if(!ui.editPoa)renderPoa();return;
    case "poaPend":ui.poaPend=b.dataset.v;if(!ui.editPoa)renderPoa();return;
    case "editPoa":ui.editPoa=b.dataset.id;ui.editPer=null;ui.confirm=null;ui.poaFocus="ep-actividad-"+b.dataset.id;renderPoa();return;
    case "cancelPoa":ui.editPoa=null;ui.confirm=null;ui.poaFocus="epb-"+b.dataset.id;if(poaPending){poa=poaPending;poaLast=JSON.stringify(poa);poaPending=null;}renderPoa();return;
    case "delPoa":var pid2=(b.dataset.key||"").split(":")[1];basePoa();poa.items=poa.items.filter(function(a){return a.id!==pid2;});ui.confirm=null;ui.editPoa=null;commitPoa();return;
    case "editPer":ui.editPer=b.dataset.id;ui.editPoa=null;ui.confirm=null;ui.poaFocus="er-actividad";renderPoa();var pe=$("per-edit");if(pe&&pe.scrollIntoView){try{pe.scrollIntoView({block:"nearest"});}catch(e){}}return;
    case "cancelPer":ui.editPer=null;ui.confirm=null;if(poaPending){poa=poaPending;poaLast=JSON.stringify(poa);poaPending=null;}renderPoa();return;
    case "delPer":var rid=(b.dataset.key||"").split(":")[1];basePoa();poa.periodicas=poa.periodicas.filter(function(a){return a.id!==rid;});ui.confirm=null;ui.editPer=null;commitPoa();return;
    case "editProj":ui.editProj=b.dataset.pid;ui.focus="rp-"+b.dataset.pid;render();var ri=$("rp-"+b.dataset.pid);if(ri)ri.select();return;
    case "cancelProj":ui.editProj=null;ui.focus="rnb-"+b.dataset.pid;if(pendingRemote){state=pendingRemote;lastJson=JSON.stringify(state);pendingRemote=null;}render();return;
    case "caView":ui.caView=b.dataset.v;try{localStorage.setItem(CAV_LS,ui.caView);}catch(e){}if(!ui.editCa)renderCa();else{["matriz","docente","grupo"].forEach(function(k){$("cav-"+k).setAttribute("aria-pressed",String(k===ui.caView));});}return;
    case "editCa":ui.editCa=b.dataset.id;ui.confirm=null;ui.caFocus="ec-horas";renderCa();return;
    case "cancelCa":ui.editCa=null;ui.confirm=null;if(caPending){ca=caPending;caLast=JSON.stringify(ca);caPending=null;}renderCa();return;
    case "delCa":var cid=(b.dataset.key||"").split(":")[1];baseCa();ca.items=ca.items.filter(function(a){return a.id!==cid;});ui.confirm=null;ui.editCa=null;commitCa();return;
    case "editDg":ui.editDg=b.dataset.id;ui.confirm=null;ui.dgFocus="eg-doc-"+b.dataset.id;renderDg();return;
    case "cancelDg":ui.editDg=null;ui.dgFocus="eg-"+b.dataset.id;if(dgPending){dg=dgPending;dgLast=JSON.stringify(dg);dgPending=null;}renderDg();return;
    case "delDg":var gid=(b.dataset.key||"").split(":")[1];baseDg();dg.items=dg.items.filter(function(a){return a.id!==gid;});ui.confirm=null;commitDg();return;
    case "tema":setTema(document.documentElement.getAttribute("data-tema")==="claro"?"oscuro":"claro",true);return;
    case "editAct":ui.editAct=b.dataset.id;ui.confirm=null;ui.actFocus="ea-act-"+b.dataset.id;renderActs();return;
    case "cancelAct":ui.editAct=null;ui.actFocus="ed-"+b.dataset.id;if(actPending){acts=actPending;actLast=JSON.stringify(acts);actPending=null;}renderActs();return;
    case "delAct":var aid=(b.dataset.key||"").split(":")[1];baseActs();acts.items=acts.items.filter(function(a){return a.id!==aid;});ui.confirm=null;commitActs();return;
    case "toggle":if(!p)return;if(p.proximo.indexOf(did)>=0)quitar(p.proximo,did);else p.proximo.push(did);ui.focus="c-a-"+p.id+"-"+did;commit();return;
    case "rm":if(!p)return;quitar(b.dataset.col==="a"?p.actual:p.proximo,did);commit();return;
    case "openAdd":ui.adding={pid:b.dataset.pid,col:b.dataset.col};ui.focus="add-"+b.dataset.col+"-"+b.dataset.pid;render();return;
    case "closeAdd":var ad=ui.adding;ui.adding=null;if(ad)ui.focus="open-"+ad.col+"-"+ad.pid;render();return;
    case "sel":ui.sel=ui.sel===did?null:did;ui.focus="per-"+did;render();return;
    case "ask":ui.confirm=b.dataset.key;render();if(!ui.editAct)renderActs();if(!ui.editDg)renderDg();renderCa();renderPoa();return;
    case "cancel":ui.confirm=null;render();if(!ui.editAct)renderActs();if(!ui.editDg)renderDg();renderCa();renderPoa();return;
    case "dgAnio":dgAnioPedir();return;
    case "dgAnioOk":dgAnioAplicar();return;
    case "dgAnioNo":dgAnioCerrar(true);return;
    case "dismiss":ui.msg=null;ui.copyText=null;render();return;
    case "keep":state.esEjemplo=false;commit();return;
    case "word":descargarWord();return;
    case "copy":copiarTablas();return;
    case "copyYear":state.proyectos.forEach(function(q){q.proximo=q.actual.slice();});ui.confirm=null;commit();return;
    case "clearAll":var keep={institucion:state.esEjemplo?"":state.institucion,a:state.anioActual,b:state.anioProximo};state=vacio();state.institucion=keep.institucion;state.anioActual=keep.a;state.anioProximo=keep.b;ui.confirm=null;ui.sel=null;ui.adding=null;commit();return;
    case "del":
      var parts=(b.dataset.key||"").split(":"),id=parts[1];
      if(parts[0]==="proj")state.proyectos=state.proyectos.filter(function(q){return q.id!==id;});
      else{state.docentes=state.docentes.filter(function(d){return d.id!==id;});state.proyectos.forEach(function(q){quitar(q.actual,id);quitar(q.proximo,id);});if(ui.sel===id)ui.sel=null;}
      ui.confirm=null;commit();return;
  }
});
document.addEventListener("submit",function(ev){
  var f=ev.target.closest("[data-form]");if(!f)return;ev.preventDefault();
  if(f.dataset.form==="newAct"||f.dataset.form==="editAct"){guardarAct(f);return;}
  if(f.dataset.form==="newDg"||f.dataset.form==="editDg"){guardarDg(f);return;}
  if(f.dataset.form==="newCa"||f.dataset.form==="editCa"){guardarCa(f);return;}
  if(/^(new|edit)(Poa|Per)$/.test(f.dataset.form)){guardarPoa(f);return;}
  var inp=f.querySelector("input[type=text]"),v=(inp.value||"").trim();if(!v)return;
  var kind=f.dataset.form;
  if(kind==="renameProj"){
    var rp=proy(f.dataset.pid);if(rp)rp.nombre=v;
    ui.editProj=null;ui.focus="rnb-"+f.dataset.pid;commit();return;
  }
  if(kind==="newProj"){
    /* el proyecto nuevo encabeza el grupo de proyectos sin docentes y se resalta un momento; se limpian filtros para que quede visible */
    var np={id:uid("p"),nombre:v,actual:[],proximo:[]};state.proyectos.unshift(np);ui.focus=inp.id;
    ui.msg="Proyecto «"+v+"» creado. Por ahora queda debajo de los proyectos con docentes; cuando le agregues integrantes sube con ellos.";
    ui.pFilter="";ui.pCon="todos";var pf=$("p-filtro");if(pf)pf.value="";
    ui.nuevo=np.id;setTimeout(function(){if(ui.nuevo===np.id){ui.nuevo=null;renderBoard();}},2500);
  }
  else if(kind==="newDoc"){docentePorNombre(v,true);ui.focus=inp.id;}
  else if(kind==="add"){
    var p=proy(f.dataset.pid);if(!p)return;var d=docentePorNombre(v,true),arr=f.dataset.col==="a"?p.actual:p.proximo;
    if(arr.indexOf(d.id)<0)arr.push(d.id);
    /* quien se suma al año actual continúa por defecto: la reunión decide después si sale */
    if(f.dataset.col==="a"&&p.proximo.indexOf(d.id)<0)p.proximo.push(d.id);
    ui.focus=inp.id;
  }
  inp.value="";commit();
});
document.addEventListener("change",function(ev){
  var t=ev.target;
  if(t.dataset&&t.dataset.field){
    var v=t.value.trim();
    if(t.dataset.field!=="institucion"&&!v){t.value=state[t.dataset.field];return;}
    state[t.dataset.field]=v;commit();
  }else if(t.dataset&&t.dataset.rename){
    var list=t.dataset.rename==="proj"?state.proyectos:state.docentes,o=list.find(function(q){return q.id===t.dataset.id;});
    if(!o)return;var n=t.value.trim();if(!n){t.value=o.nombre;return;}
    o.nombre=n;commit();
  }
});
document.addEventListener("focusout",function(){
  if(!pendingRemote)return;
  setTimeout(function(){if(pendingRemote&&!dirty&&!saving){var n=pendingRemote;pendingRemote=null;adoptar(n);}else{pendingRemote=null;}},0);
});

document.addEventListener("keydown",function(ev){
  if(ev.key==="Enter"&&ev.target.matches&&ev.target.matches('tr[data-act="editPer"]')){ev.target.click();return;}
  if(ev.key!=="Escape")return;
  var f=ev.target.closest&&ev.target.closest('[data-form="renameProj"]');if(!f)return;
  ui.editProj=null;ui.focus="rnb-"+f.dataset.pid;render();
});
document.addEventListener("keydown",function(ev){
  if(ev.target.id==="dg-anio"&&ev.key==="Enter"){ev.preventDefault();dgAnioPedir();return;}
  var pc=$("dg-anio-confirm");if(!pc||pc.hidden)return;
  if(ev.key==="Escape"){ev.preventDefault();dgAnioCerrar(true);return;}
  if(ev.key==="Tab"){
    /* foco atrapado entre Confirmar y Cancelar mientras el diálogo está abierto */
    var ok=$("dg-anio-ok"),no=$("dg-anio-no"),a=document.activeElement;
    if(ev.shiftKey&&a===ok){ev.preventDefault();no.focus();}
    else if(!ev.shiftKey&&a===no){ev.preventDefault();ok.focus();}
    else if(a!==ok&&a!==no){ev.preventDefault();ok.focus();}
  }
});
document.addEventListener("input",function(ev){
  if(ev.target.id==="p-filtro"){ui.pFilter=ev.target.value;renderBoard();}
  if(ev.target.id==="ca-filtro"){ui.caFilter=ev.target.value;if(!ui.editCa)renderCa();}
  if(ev.target.id==="dg-filtro"){ui.dgFilter=ev.target.value;if(!ui.editDg)renderDg();}
  if(ev.target.id==="act-filtro"){ui.actFilter=ev.target.value;if(!ui.editAct)renderActs();}
  if(ev.target.id==="poa-filtro"){ui.poaFilter=ev.target.value;if(!ui.editPoa)renderPoa();}
});

initTema();initCa();initPoa();render();initTab();renderActs();renderDg();renderCa();renderPoa();
conectar();
}
