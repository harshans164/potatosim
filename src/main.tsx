import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GeometryWindow from "./GeometryWindow";

const RootComponent = window.location.hash === "#/geometry" ? GeometryWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
