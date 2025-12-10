function checkAuth(){const t=localStorage.getItem("user"),
  e=window.location.pathname;
  return!(!t&&"/login.html"!==e)||(window.location.href="/login.html",!1)}
  "loading"===document.readyState?document.addEventListener("DOMContentLoaded",checkAuth):checkAuth();