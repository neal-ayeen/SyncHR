(() => {
  'use strict';
  const META_KEY = 'people_desk_documents_v2';
  const FOLDER_KEY = 'people_desk_document_folders_v1';
  const DATA_VERSION = 3;
  const DB_NAME = 'people_desk_files';
  const STORE = 'files';
  const baseFolders = ['All Documents','Contracts','Policies','Employee Files','IDs & Government Docs','Onboarding','Warning Letters','Training','Offboarding','Other Documents'];
  const statusOptions = ['Draft','Pending Review','Pending Signature','Active','Completed','Needs Update','Expiring Soon','Expired','Archived'];
  const warningTypes = ['First Written Warning','Final Written Warning','Attendance Warning','Performance Warning','Behavioral Warning','Suspension Notice'];
  const $ = id => document.getElementById(id);
  const make = (tag, className, text) => { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=text; return node; };
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const today = () => new Date().toISOString().slice(0,10);
  const dateText = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '—';
  const slug = value => String(value||'document').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'') || 'document';
  let folder='All Documents', warningFilter='', selectedId='', selected=new Set(), metadata=loadMeta(), customFolders=loadFolders();

  function loadMeta(){
    try {
      const value=JSON.parse(localStorage.getItem(META_KEY));
      if(value?.version===DATA_VERSION&&Array.isArray(value.documents))return value.documents;
      const old=Array.isArray(value)?value:Array.isArray(value?.documents)?value.documents:[];
      const removed=new Set(['Payroll','Performance','Leave & Attendance','Benefits','Shared']);
      const realUploads=old.filter(doc=>doc?.hasFile===true).map(doc=>({...doc,category:removed.has(doc.category)?'Other Documents':doc.category,manualStatus:statusOptions.includes(doc.manualStatus)?doc.manualStatus:'Draft'}));
      localStorage.setItem(META_KEY,JSON.stringify({version:DATA_VERSION,documents:realUploads}));
      return realUploads;
    } catch { return []; }
  }
  function saveMeta(){ localStorage.setItem(META_KEY,JSON.stringify({version:DATA_VERSION,documents:metadata})); }
  function loadFolders(){ try { const value=JSON.parse(localStorage.getItem(FOLDER_KEY)); return Array.isArray(value)?value.map(x=>x==='Shared'?'Other Documents':x).filter(x=>!['Payroll','Performance','Leave & Attendance','Benefits'].includes(x)):[]; } catch { return []; } }
  function saveFolders(){ localStorage.setItem(FOLDER_KEY,JSON.stringify(customFolders)); }
  function allFolders(){ return [...new Set([...baseFolders,...customFolders])]; }
  function teamMembers(){ try { const app=JSON.parse(localStorage.getItem('people_desk_local_v1')); return Array.isArray(app?.people)?app.people.map(p=>p.name).filter(Boolean):[]; } catch { return []; } }
  function computedStatus(doc){
    if(doc.manualStatus==='Archived')return 'Archived';
    if(doc.manualStatus==='Completed')return 'Completed';
    if(doc.expiryDate){
      const days=Math.ceil((new Date(`${doc.expiryDate}T00:00:00`)-new Date(`${today()}T00:00:00`))/864e5);
      if(days<0)return 'Expired';
      if(days<=30)return 'Expiring Soon';
    }
    return statusOptions.includes(doc.manualStatus)?doc.manualStatus:'Draft';
  }
  function statusClass(status){ return status.toLowerCase().replace(/\s+/g,'-'); }
  function expiryDetail(doc){
    if(!doc.expiryDate)return 'No expiry date';
    const days=Math.ceil((new Date(`${doc.expiryDate}T00:00:00`)-new Date(`${today()}T00:00:00`))/864e5);
    if(days<0)return `Expired ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ago`;
    if(days===0)return 'Expires today';
    return `Expires in ${days} day${days===1?'':'s'}`;
  }
  function notify(text){ const t=$('toast'); if(t){t.textContent=text;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600);} }

  function openDb(){
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>request.result.createObjectStore(STORE);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }
  async function putFile(id,file){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
  async function getFile(id){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(STORE).objectStore(STORE).get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function deleteFile(id){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}

  function renderKpis(){
    const target=$('docKpis'); target.replaceChildren();
    const warningCount=metadata.filter(d=>d.category==='Warning Letters').length;
    const expiring=metadata.filter(d=>computedStatus(d)==='Expiring Soon').length;
    const awaiting=metadata.filter(d=>computedStatus(d)==='Pending Signature').length;
    [['📄','Total files',metadata.length,'#398be7','all'],['📋','Contracts',metadata.filter(d=>d.category==='Contracts').length,'#49be64','contracts'],['⚠','Warning letters',warningCount,'#ef5751','warnings'],['✎','Pending signature',awaiting,'#7850da','signature'],['◷','Expiring soon',expiring,'#f3aa32','expiring']].forEach(([icon,label,count,color,action])=>{
      const card=make('div','doc-kpi'),bubble=make('div','doc-kpi-icon',icon),info=make('div');
      bubble.style.background=color; info.append(make('span','',label),make('strong','',String(count)),make('button','','View documents'));
      card.append(bubble,info); card.addEventListener('click',()=>{folder=action==='contracts'?'Contracts':action==='warnings'?'Warning Letters':'All Documents';warningFilter='';render();if(action==='signature'){$('docStatusFilter').value='Pending Signature';renderTable();}if(action==='expiring'){$('docStatusFilter').value='Expiring Soon';renderTable();}});target.append(card);
    });
  }
  function renderWarnings(){
    const target=$('docWarningTypes'); target.replaceChildren();
    warningTypes.forEach(type=>{const count=metadata.filter(d=>d.warningType===type).length,box=make('button','doc-warning-type');box.type='button';box.append(make('small','',type),make('b','',String(count)),make('small','',count?'View all':'No records'));box.addEventListener('click',()=>{folder='Warning Letters';warningFilter=type;render();});target.append(box);});
  }
  function renderFolders(){
    const target=$('docFolderList');target.replaceChildren();
    allFolders().forEach(name=>{const count=name==='All Documents'?metadata.length:metadata.filter(d=>d.category===name).length,button=make('button',`doc-folder${folder===name?' active':''}${name==='Warning Letters'?' warning':''}`);button.append(make('span','',`${name==='Warning Letters'?'⚠':'▣'} ${name}`),make('span','',String(count)));button.addEventListener('click',()=>{folder=name;warningFilter='';render();});target.append(button);});
  }
  function fillSelect(select,values,first){
    const current=select.value;select.replaceChildren();const option=document.createElement('option');option.value='';option.textContent=first;select.append(option);
    values.forEach(value=>{const o=document.createElement('option');o.value=value;o.textContent=value;select.append(o);});select.value=values.includes(current)?current:'';
  }
  function filteredDocs(){
    const q=$('docSearch').value.trim().toLowerCase(),cat=$('docCategoryFilter').value,owner=$('docOwnerFilter').value,status=$('docStatusFilter').value;
    const docs=metadata.filter(d=>(folder==='All Documents'||d.category===folder)&&(!warningFilter||d.warningType===warningFilter)&&(!q||[d.documentName,d.ownerName,d.documentType,d.warningType].join(' ').toLowerCase().includes(q))&&(!cat||d.category===cat)&&(!owner||d.ownerName===owner)&&(!status||computedStatus(d)===status));
    const sort=$('docSort').value; return docs.sort((a,b)=>sort==='name'?a.documentName.localeCompare(b.documentName):sort==='oldest'?a.updatedAt.localeCompare(b.updatedAt):b.updatedAt.localeCompare(a.updatedAt));
  }
  function renderTable(){
    const body=$('docTableBody'),docs=filteredDocs();body.replaceChildren();$('docEmpty').style.display=docs.length?'none':'block';
    docs.forEach(doc=>{
      const tr=document.createElement('tr'),check=document.createElement('input');check.type='checkbox';check.checked=selected.has(doc.id);check.addEventListener('change',()=>{check.checked?selected.add(doc.id):selected.delete(doc.id);updateSelection();});
      const nameButton=make('button','doc-name-button'),icon=make('span','doc-file-icon',(doc.fileName.split('.').pop()||'FILE').toUpperCase().slice(0,4));nameButton.append(icon,document.createTextNode(doc.documentName));nameButton.addEventListener('click',()=>{selectedId=doc.id;renderPreview();});
      const status=computedStatus(doc),badge=make('button',`doc-status ${statusClass(status)}`,status);badge.type='button';badge.addEventListener('click',()=>{$('docStatusFilter').value=status;renderTable();});
      const actions=make('div','doc-row-actions'),download=make('button','','↓'),view=make('button','','View'),remove=make('button','','×');
      download.title='Download';download.addEventListener('click',()=>downloadDocument(doc.id));view.addEventListener('click',()=>{selectedId=doc.id;renderPreview();});remove.title='Delete';remove.addEventListener('click',()=>removeDocument(doc.id));
      actions.append(download,view,remove);
      [check,nameButton,doc.category,doc.ownerName,doc.documentType||'File',doc.expiryDate?`${dateText(doc.expiryDate)} · ${expiryDetail(doc)}`:'—',dateText(doc.updatedAt),badge,actions].forEach(value=>{const td=document.createElement('td');value instanceof Node?td.append(value):td.textContent=value;tr.append(td);});body.append(tr);
    });
    updateSelection();
  }
  function renderPreview(){
    const target=$('docPreview'),doc=metadata.find(d=>d.id===selectedId);target.replaceChildren();
    if(!doc){target.append(make('div','doc-preview-empty','Select a document to see its details.'));return;}
    const status=computedStatus(doc);target.append(make('h3','',doc.documentName),make('div','doc-file-preview',`${(doc.fileName.split('.').pop()||'FILE').toUpperCase()} FILE`));
    const badge=make('span',`doc-status ${statusClass(status)}`,status),dl=document.createElement('dl');dl.className='doc-preview-grid';
    [['Category',doc.category],['Employee',doc.ownerName],['Type',doc.documentType||'File'],['Issue date',dateText(doc.issueDate)],['Expiry',doc.expiryDate?`${dateText(doc.expiryDate)} (${expiryDetail(doc)})`:'No expiry'],['Updated',dateText(doc.updatedAt)],['Access',doc.access],['Warning type',doc.warningType||'—']].forEach(([key,value])=>{dl.append(make('dt','',key),make('dd','',value));});
    const actions=make('div','doc-preview-actions'),download=make('button','button','Download'),view=make('button','button secondary','View file'),replace=make('button','button secondary','Replace file');
    download.addEventListener('click',()=>downloadDocument(doc.id));view.addEventListener('click',()=>viewDocument(doc.id));replace.addEventListener('click',()=>openUpload(doc));
    actions.append(download,view,replace);target.append(badge,dl,make('p','item-meta',doc.notes||'No HR notes.'),actions);
  }
  function updateSelection(){$('docSelectionLabel').textContent=`${selected.size} selected`;}
  function render(){
    renderKpis();renderWarnings();renderFolders();
    fillSelect($('docCategoryFilter'),allFolders().filter(x=>x!=='All Documents'),'All categories');
    fillSelect($('docOwnerFilter'),[...new Set(['Company',...teamMembers(),...metadata.map(d=>d.ownerName)])].filter(Boolean),'All team members');
    fillSelect($('docStatusFilter'),statusOptions,'All statuses');
    renderTable();renderPreview();
  }

  async function downloadDocument(id){
    const doc=metadata.find(d=>d.id===id);if(!doc)return;
    const file=await getFile(id);if(!file){notify('This sample record has no uploaded file yet. Use Replace file.');return;}
    const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=doc.fileName||slug(doc.documentName);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function viewDocument(id){
    const file=await getFile(id);if(!file){notify('No uploaded file is attached to this record.');return;}
    const url=URL.createObjectURL(file);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function removeDocument(id){
    const doc=metadata.find(d=>d.id===id);if(!doc||!confirm(`Delete “${doc.documentName}”?`))return;
    metadata=metadata.filter(d=>d.id!==id);selected.delete(id);if(selectedId===id)selectedId='';await deleteFile(id);saveMeta();render();notify('Document deleted.');
  }
  function openUpload(existing){
    const form=$('docUploadForm');form.reset();form.dataset.replaceId=existing?.id||'';
    fillSelect($('docUploadCategory'),allFolders().filter(x=>x!=='All Documents'),'Choose folder');
    fillSelect($('docUploadOwner'),[...new Set(['Company',...teamMembers(),...metadata.map(d=>d.ownerName)])].filter(Boolean),'Choose owner');
    if(existing){form.documentName.value=existing.documentName;form.category.value=existing.category;form.ownerName.value=existing.ownerName;form.documentType.value=existing.documentType||'';form.manualStatus.value=statusOptions.includes(existing.manualStatus)?existing.manualStatus:'Draft';form.issueDate.value=existing.issueDate||'';form.expiryDate.value=existing.expiryDate||'';form.warningType.value=existing.warningType||'';form.access.value=existing.access||'HR Only';form.notes.value=existing.notes||'';}
    $('docUploadModal').classList.add('open');$('docUploadModal').setAttribute('aria-hidden','false');
  }
  function closeUpload(){$('docUploadModal').classList.remove('open');$('docUploadModal').setAttribute('aria-hidden','true');}
  async function saveUpload(event){
    event.preventDefault();const form=event.currentTarget,data=new FormData(form),file=data.get('file'),replaceId=form.dataset.replaceId,id=replaceId||uid();
    if(!(file instanceof File)||!file.size){notify('Choose a file to upload.');return;}
    await putFile(id,file);
    const record={id,documentName:String(data.get('documentName')||file.name).trim(),category:String(data.get('category')||'Employee Files'),ownerName:String(data.get('ownerName')||'Company'),documentType:String(data.get('documentType')||file.name.split('.').pop()||'File'),manualStatus:String(data.get('manualStatus')||'Draft'),issueDate:String(data.get('issueDate')||''),expiryDate:String(data.get('expiryDate')||''),warningType:String(data.get('warningType')||''),access:String(data.get('access')||'HR Only'),notes:String(data.get('notes')||''),updatedAt:today(),fileName:file.name,fileType:file.type,hasFile:true};
    const index=metadata.findIndex(d=>d.id===id);index<0?metadata.unshift(record):metadata[index]={...metadata[index],...record};saveMeta();selectedId=id;closeUpload();render();notify('Document uploaded locally.');
  }
  function addFolder(){const name=prompt('New folder name');if(!name)return;const clean=name.trim().slice(0,60);if(clean&&!allFolders().includes(clean)){customFolders.push(clean);saveFolders();render();notify('Folder added.');}}
  function exportData(){const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),documents:metadata,customFolders},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`people-desk-documents-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function importData(file){const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(reader.result);if(!Array.isArray(parsed.documents))throw Error();const removed=new Set(['Payroll','Performance','Leave & Attendance','Benefits','Shared']);metadata=parsed.documents.slice(0,1000).map(doc=>({...doc,category:removed.has(doc.category)?'Other Documents':doc.category,manualStatus:statusOptions.includes(doc.manualStatus)?doc.manualStatus:'Draft'}));customFolders=Array.isArray(parsed.customFolders)?parsed.customFolders.map(x=>x==='Shared'?'Other Documents':x).filter(x=>!removed.has(x)):customFolders;saveMeta();saveFolders();render();notify('Document metadata imported. Files must be uploaded separately.');}catch{notify('That is not a valid People Desk document export.');}};reader.readAsText(file);}

  function bind(){
    $('docUploadTop').addEventListener('click',()=>openUpload());$('docNewFolder').addEventListener('click',addFolder);$('docNewFolderBottom').addEventListener('click',addFolder);
    $('docUploadClose').addEventListener('click',closeUpload);$('docUploadCancel').addEventListener('click',closeUpload);$('docUploadForm').addEventListener('submit',saveUpload);
    $('docUploadModal').addEventListener('click',e=>{if(e.target===$('docUploadModal'))closeUpload();});
    ['docSearch','docCategoryFilter','docOwnerFilter','docStatusFilter','docSort'].forEach(id=>$(id).addEventListener(id==='docSearch'?'input':'change',renderTable));
    $('docClearFilters').addEventListener('click',()=>{$('docSearch').value='';$('docCategoryFilter').value='';$('docOwnerFilter').value='';$('docStatusFilter').value='';folder='All Documents';warningFilter='';render();});
    $('docSelectAll').addEventListener('change',e=>{filteredDocs().forEach(d=>e.target.checked?selected.add(d.id):selected.delete(d.id));renderTable();});
    $('docExport').addEventListener('click',exportData);$('docImport').addEventListener('click',()=>$('docImportPicker').click());$('docImportPicker').addEventListener('change',e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value='';});
    document.querySelector('[data-view="documents"]')?.addEventListener('click',render);
  }
  window.renderDocuments=render;
  window.addEventListener('storage',event=>{
    if(event.key===META_KEY){metadata=loadMeta();selected.clear();selectedId='';render();}
    if(event.key===FOLDER_KEY){customFolders=loadFolders();render();}
  });
  bind();render();
})();
