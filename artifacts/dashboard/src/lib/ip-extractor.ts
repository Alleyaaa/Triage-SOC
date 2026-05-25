export function extractIpFromJson(jsonString: string, source: string): string | null {
  try {
    const data = JSON.parse(jsonString);
    if (source === 'fortigate' && data?.data?.srcip) return data.data.srcip;
    if (source === 'watchguard' && data?.data?.watchguard?.ip_address) return data.data.watchguard.ip_address;
    if ((source === 'agent_windows' || source === 'agent_linux') && data?.agent?.ip) return data.agent.ip;
  } catch (e) {
    return null;
  }
  return null;
}