import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import GeometryWindow from "./GeometryWindow";
import MeshWindow from "./MeshWindow";

const RootComponent = window.location.hash === "#/geometry" ? GeometryWindow : window.location.hash === "#/mesh" ? MeshWindow : App;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
);
