import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const cleartext = serverUrl?.startsWith("http://") ?? false;

const config: CapacitorConfig = {
  appId: "com.ani9085.easytravel",
  appName: "Easy Travel",
  webDir: "public",
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext,
          androidScheme: "https"
        }
      }
    : {})
};

export default config;
