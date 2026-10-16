import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { create } from 'zustand';
import { useUiStore } from '../stores/uiStore';
import { API_BASE, useAuth } from './api';
import { hasUnpublished, useProjectSession } from './projectSession';

/**
 * Misma cuenta en varios dispositivos (la PC y el Quest): cuando uno abre un proyecto (a mano o
 * porque se lo pidió al agente), los otros lo abren también. Dentro del proyecto, la sala
 * (`xr/room.ts`) ya comparte el diseño en vivo; esto solo hace que todos estén en la misma sala.
 *
 * El canal es `/api/me/ws`: un relé por usuario, sin estado.
 */

let navigateFn: ((to: string) => void) | null = null;

/** Navega dentro de la app (lo usa el agente para abrir proyectos). */
export function appNavigate(to: string): boolean {
  if (!navigateFn) return false;
  navigateFn(to);
  return true;
}

const FOLLOW_KEY = 'cronos.followDevices';

function readFollow(): boolean {
  try {
    return localStorage.getItem(FOLLOW_KEY) !== '0';
  } catch {
    return true;
  }
}

export const useDeviceSync = create<{ follow: boolean; others: number }>(() => ({
  follow: readFollow(),
  others: 0,
}));

export function setFollowDevices(follow: boolean): void {
  useDeviceSync.setState({ follow });
  try {
    localStorage.setItem(FOLLOW_KEY, follow ? '1' : '0');
  } catch {
    // sin almacenamiento: dura lo que dure la pestaña
  }
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/OculusBrowser|Quest/i.test(ua)) return 'el visor';
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'el celular';
  return 'la PC';
}

function meUrl(): string {
  const url = new URL(`${API_BASE || '/api'}/me/ws`, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.href;
}

type MeMessage =
  | { type: 'goto'; projectId: string; from: string }
  | { type: 'devices'; count: number };

/** Monta el puente de navegación y el canal entre dispositivos (dentro del router). */
export function DeviceSyncBridge(): null {
  const navigate = useNavigate();
  const location = useLocation();
  const authed = useAuth((s) => s.status === 'authenticated');

  useEffect(() => {
    navigateFn = (to) => void navigate(to);
    return () => {
      navigateFn = null;
    };
  }, [navigate]);

  // Ruta actual para no repetir una navegación ya hecha.
  const path = location.pathname;
  useEffect(() => {
    currentPath = path;
  }, [path]);

  useEffect(() => {
    if (!authed) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    /**
     * Proyectos abiertos por seguir a otro dispositivo: no se anuncian (si no, dos dispositivos se
     * devuelven el anuncio y rebotan entre proyectos).
     */
    const followed = new Set<string>();
    let announced: string | null = useProjectSession.getState().current?.projectId ?? null;

    const send = (m: object) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
    };
    const announce = () => {
      const id = useProjectSession.getState().current?.projectId ?? null;
      if (!id || id === announced) return;
      announced = id;
      if (followed.delete(id)) return;
      send({ type: 'goto', projectId: id, from: deviceName() });
    };
    const connect = () => {
      const socket = new WebSocket(meUrl());
      ws = socket;
      // Al (re)conectar no se anuncia nada: el servidor le manda a este dispositivo el último
      // proyecto abierto en los otros (un visor que se reconecta no arrastra a la PC, ni al revés).
      socket.onmessage = (ev) => {
        let m: MeMessage;
        try {
          m = JSON.parse(String(ev.data)) as MeMessage;
        } catch {
          return;
        }
        if (m.type === 'devices') {
          useDeviceSync.setState({ others: m.count });
          return;
        }
        if (!useDeviceSync.getState().follow) return;
        const target = `/projects/${m.projectId}`;
        if (currentPath === target) return;
        if (hasUnpublished()) {
          useUiStore
            .getState()
            .notify(`Desde ${m.from} se abrió otro proyecto; aquí hay cambios sin publicar y no lo sigo.`, 'error');
          return;
        }
        followed.clear();
        followed.add(m.projectId);
        useUiStore.getState().notify(`Siguiendo a ${m.from}: abriendo el proyecto.`);
        appNavigate(target);
      };
      socket.onclose = () => {
        if (ws === socket) ws = null;
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    const off = useProjectSession.subscribe(announce);
    return () => {
      closed = true;
      clearTimeout(retry);
      off();
      ws?.close();
    };
  }, [authed]);

  return null;
}

let currentPath = '';
