import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { NotelixDefaultServer } from "../consts";
import { clearUser, getServer, getUser, setServer } from "../../storage";
import { clearEncryptionKey, getKey } from "../../encryption";
import { resetAgentData } from "../../api/agentControl";
import { PopupLoading } from "../components/PopupLayout";

export const Index = () => {
  const navigate = useNavigate();
  useEffect(() => {
    async function resolveRoute() {
      const [notelixServer, notelixUser] = await Promise.all([
        getServer(),
        getUser(),
      ]);
      if (!notelixServer) {
        await setServer(NotelixDefaultServer);
        navigate("/login");
      } else if (!notelixUser) {
        navigate("/login");
      } else {
        try {
          await getKey();
          navigate("/user-info");
        } catch {
          await clearEncryptionKey();
          await clearUser();
          await resetAgentData().catch(() => undefined);
          navigate("/login");
        }
      }
    }
    resolveRoute();
  }, [navigate]);

  return <PopupLoading />;
};
