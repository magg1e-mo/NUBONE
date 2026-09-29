self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(_){}
  e.waitUntil(self.registration.showNotification(d.title||"NUBONE",{
    body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",tag:d.tag||"nubone",data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
    for(const c of list){if("focus" in c)return c.focus();}
    return clients.openWindow((e.notification.data&&e.notification.data.url)||"./");
  }));
});
