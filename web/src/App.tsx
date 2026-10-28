import { MobileRuntime } from "./mobile";
import Prototype from "./Prototype";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const showDevicePreview = import.meta.env.DEV || params.get("preview") === "1" || params.get("qa") === "1";

  return (
    <div className={showDevicePreview ? "prototype-runtime" : "production-runtime"}>
      <MobileRuntime>
        <Prototype />
      </MobileRuntime>
    </div>
  );
}
