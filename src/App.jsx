import { useEffect } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Topbar from "./components/Topbar.jsx";

export default function App() {
  useEffect(() => {
    import("../app.js").catch(error => {
      console.error("Unable to load the Asama application.", error);
      const view = document.querySelector("#view-container");
      if (view) {
        view.textContent = "The application could not be loaded. Refresh the page to try again.";
      }
    });
  }, []);

  return (
    <>
      <Sidebar />
      <main className="main-panel">
        <Topbar />
        <div id="view-container" className="view-container" />
      </main>
    </>
  );
}
