
import { initManager, getAccounts } from "../auth/manager";
import { getImpersonationHeaders } from "../utils/headers";
import { refreshAccessToken } from "../auth/oauth";

async function debugQuota() {
    await initManager();
    const accounts = getAccounts();
    const account = accounts[0];

    if (!account) {
        console.log("No accounts found.");
        return;
    }

    console.log(`Debugging quota for: ${account.email}`);

    // Refresh token just in case
    try {
        const tokens = await refreshAccessToken(account.refreshToken);
        account.accessToken = tokens.access_token;
    } catch(e) {
        console.error("Token refresh failed", e);
    }

    const res = await fetch(`https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels`, {
      method: "POST",
      headers: {
        ...getImpersonationHeaders(account.accessToken || ""),
        "User-Agent": "antigravity", 
      },
      body: JSON.stringify({
        project: account.projectId
      })
    });

    if (!res.ok) {
        console.error(`Status: ${res.status}`);
        console.log(await res.text());
        return;
    }

    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}

debugQuota();
