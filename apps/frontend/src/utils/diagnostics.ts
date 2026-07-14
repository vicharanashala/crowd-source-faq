import api from './api';

export interface DiagnosticResult {
  passed: boolean;
  status: string;
  details?: string;
}

export async function checkCameraAccess(): Promise<DiagnosticResult> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { passed: false, status: 'Not Supported', details: 'Browser does not support media devices api.' };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return { passed: true, status: 'Passed', details: 'Camera access is granted and working.' };
  } catch (err) {
    return { passed: false, status: 'Failed', details: `Camera access failed: ${(err as Error).message}` };
  }
}

export async function checkMicrophoneAccess(): Promise<DiagnosticResult> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { passed: false, status: 'Not Supported', details: 'Browser does not support media devices api.' };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { passed: true, status: 'Passed', details: 'Microphone access is granted and working.' };
  } catch (err) {
    return { passed: false, status: 'Failed', details: `Microphone access failed: ${(err as Error).message}` };
  }
}

export async function checkBatteryStatus(): Promise<DiagnosticResult> {
  try {
    if (!('getBattery' in navigator)) {
      return { passed: true, status: 'Not Supported', details: 'Battery API is not supported. Assuming plugged in.' };
    }
    const battery: any = await (navigator as any).getBattery();
    const levelPercent = Math.round(battery.level * 100);
    const details = `Battery is at ${levelPercent}%, charging: ${battery.charging ? 'Yes' : 'No'}.`;
    
    if (battery.level < 0.2 && !battery.charging) {
      return { passed: false, status: 'Low Battery', details: `${details} Warning: Low battery, please plug in your charger.` };
    }
    return { passed: true, status: 'Passed', details };
  } catch (err) {
    return { passed: true, status: 'Unknown', details: `Could not fetch battery status: ${(err as Error).message}` };
  }
}

export async function checkVpnAndNetwork(): Promise<DiagnosticResult> {
  const start = Date.now();
  try {
    const res = await api.get<{ isVpn: boolean; clientIp: string; reason?: string }>('/support/diagnostics/check-vpn');
    const latency = Date.now() - start;
    const details = `IP: ${res.data.clientIp}, RTT Latency: ${latency}ms. ${res.data.isVpn ? `VPN detected: ${res.data.reason || 'VPN header detected'}` : 'No VPN detected'}`;
    
    if (res.data.isVpn) {
      return { passed: false, status: 'VPN Detected', details };
    }
    return { passed: true, status: 'Passed', details };
  } catch (err) {
    return { passed: false, status: 'Network Error', details: `Failed to connect to diagnostics server: ${(err as Error).message}` };
  }
}
