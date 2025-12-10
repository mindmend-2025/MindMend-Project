let clerk=null,syncedUserId=null;
const updateStatus = (e,t) =>{
  const r=document.getElementById("sync-status"),
  o=document.getElementById("sync-status-text");
  r&&(r.dataset.state=e),
  o&&(o.textContent=t)
},
loadClerk=() =>new Promise((e,t) =>{
  const r=setTimeout(() =>t(new Error("Clerk timeout")),12e3),o=() =>{
    window.Clerk?.load?window.Clerk.load().then(() =>{
      clearTimeout(r),e(window.Clerk)
    }).catch(t):requestAnimationFrame(o)
  };
  o()
}),mountSignIn=() =>{
  const e=document.getElementById("clerk-sign-in");
  e&&clerk&&clerk.mountSignIn(e,{
    appearance:{
      elements:{
        card:"!bg-transparent !border-none !shadow-none",headerTitle:"!text-white !text-2xl",headerSubtitle:"!text-white/50 !text-sm",formFieldLabel:"!text-white/70 !text-sm",formFieldInput:"!bg-white/5 !border-white/10 !text-white !rounded-lg !py-3",formButtonPrimary:"!bg-white !text-black !rounded-lg !font-semibold !py-3 hover:!shadow-[0_0_30px_rgba(255,255,255,0.5)]",socialButtonsBlockButton:"!bg-white/5 hover:!bg-white/10 !text-white !border-white/10 !rounded-lg !py-3 !transition-all !duration-300",socialButtonsBlockButton__facebook:"hover:!shadow-[0_0_25px_rgba(24,119,242,0.8),0_0_50px_rgba(24,119,242,0.4)]",socialButtonsBlockButton__twitter:"hover:!shadow-[0_0_25px_rgba(255,255,255,0.6),0_0_50px_rgba(255,255,255,0.3)]",socialButtonsBlockButtonText:"!text-white !font-medium",socialButtonsProviderIcon:"!brightness-100 !drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] hover:!drop-shadow-[0_0_20px_rgba(255,255,255,1)]",socialButtonsProviderIcon__facebook:"!drop-shadow-[0_0_10px_rgba(24,119,242,0.8)] hover:!drop-shadow-[0_0_20px_rgba(24,119,242,1)]",socialButtonsProviderIcon__twitter:"!drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] hover:!drop-shadow-[0_0_20px_rgba(255,255,255,1)]",footerActionLink:"!text-purple-400 hover:!text-purple-300"
      }
    },signInFallbackRedirectUrl:"/index.html",afterSignInUrl:"/index.html",afterSignUpUrl:"/index.html"
  })
},syncAndRedirect=async() =>{
  if(clerk?.user?.id&&clerk?.session)if(clerk.user.id!==syncedUserId)try{
    updateStatus("syncing","Syncing profile…");
    const e=await clerk.session.getToken({
      template:"integration_fallback"
    });
    if(!e)throw new Error("No session token");
    const t=await fetch("/api/auth/sync-user",{
      method:"POST",headers:{
        "Content-Type":"application/json",Authorization:`Bearer ${
          e
        }`
      },body:JSON.stringify({
        profile:{
          userId:clerk.user.id,email:clerk.user.primaryEmailAddress?.emailAddress??"",firstName:clerk.user.firstName??"",lastName:clerk.user.lastName??"",imageUrl:clerk.user.imageUrl??""
        }
      })
    });
    if(!t.ok)throw new Error((await t.json().catch(() =>({
    }))).message||"Sync failed");
    syncedUserId=clerk.user.id;
    const r="admin"===clerk.user.publicMetadata?.role,o=r?"/admin.html":"/index.html";
    updateStatus("success",r?"Admin access granted. Redirecting…":"Profile synced. Redirecting…"),setTimeout(() =>window.location.href=o,800)
  }
  catch(e){
    console.error(e),updateStatus("error",e.message||"Sync error")
  }
  else updateStatus("success","Already synced. Redirecting…")
},init=async() =>{
  try{
    updateStatus("loading","Loading sign in…"),clerk=await loadClerk(),mountSignIn(),clerk.user&&syncAndRedirect(),clerk.addListener(({
      user:e
    }) =>{
      e?syncAndRedirect():updateStatus("idle","Ready to sign in")
    })
  }
  catch(e){
    console.error(e),updateStatus("error","Authentication unavailable")
  }
};
document.addEventListener("DOMContentLoaded",init);