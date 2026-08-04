import { useCallback, useEffect, useState } from "react";

const ROUTE_CHANGE_EVENT = "kcgrouter-route-change";

export function useRouter() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    function onRouteChange() {
      setPathname(window.location.pathname);
    }
    window.addEventListener("popstate", onRouteChange);
    window.addEventListener(ROUTE_CHANGE_EVENT, onRouteChange);
    return () => {
      window.removeEventListener("popstate", onRouteChange);
      window.removeEventListener(ROUTE_CHANGE_EVENT, onRouteChange);
    };
  }, []);

  const navigate = useCallback((path: string) => {
    if (path === window.location.pathname) return;
    window.history.pushState(null, "", path);
    setPathname(path);
    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
  }, []);

  return { pathname, navigate };
}
