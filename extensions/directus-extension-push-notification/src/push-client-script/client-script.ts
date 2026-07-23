/**
 * Script client-side para gerenciar Push Notifications no frontend do Directus
 *
 * Este script:
 * 1. Registra o Service Worker
 * 2. Verifica se o usuário quer receber push (push_enabled)
 * 3. Solicita permissão de notificação
 * 4. Cria subscription e envia para o backend
 */

export function getClientScript(
  vapidPublicKey: string,
  publicUrl: string,
): string {
  return `
(function() {
  'use strict';
  
  const VAPID_PUBLIC_KEY = '${vapidPublicKey}';
  const PUBLIC_URL = '${publicUrl}';
  const DEBUG = true;
  
  function log(...args) {
    console.log('[PushNotification]', ...args);
  }
  
  function warn(...args) {
    console.warn('[PushNotification]', ...args);
  }
  
  function error(...args) {
    console.error('[PushNotification]', ...args);
  }
  
  log('=== Script carregado ===');
  log('VAPID_PUBLIC_KEY:', VAPID_PUBLIC_KEY ? 'configurada (' + VAPID_PUBLIC_KEY.substring(0, 20) + '...)' : 'NÃO CONFIGURADA');
  log('PUBLIC_URL:', PUBLIC_URL);
  log('Protocol:', window.location.protocol);
  log('Host:', window.location.host);

  function urlBase64ToUint8Array(base64String) {
    try {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      log('VAPID key convertida para Uint8Array, length:', outputArray.length);
      return outputArray;
    } catch (e) {
      error('Erro ao converter VAPID key:', e);
      throw e;
    }
  }

  async function getUserPushSettings() {
    try {
      log('Buscando configurações do usuário via /users/me...');
      const response = await fetch(PUBLIC_URL + '/users/me?fields=id,push_enabled', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      log('Resposta /users/me:', response.status);
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          log('Usuário não autenticado (status:', response.status + ')');
        } else {
          warn('Erro ao buscar configurações do usuário:', response.status);
        }
        return null;
      }

      const data = await response.json();
      log('Dados do usuário:', data.data);
      return data.data;
    } catch (e) {
      error('Erro ao buscar configurações:', e);
      return null;
    }
  }

  async function registerSubscription(subscription, deviceName) {
    try {
      log('Enviando subscription para o servidor...');
      const response = await fetch(PUBLIC_URL + '/push-notification/register', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          device_name: deviceName
        })
      });

      log('Resposta do registro:', response.status);
      
      if (response.ok) {
        log('Subscription registrada com sucesso');
        return true;
      } else {
        const errorText = await response.text();
        warn('Erro ao registrar subscription:', response.status, errorText);
        return false;
      }
    } catch (e) {
      error('Erro ao registrar subscription:', e);
      return false;
    }
  }

  function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS Device';
    if (/Android/.test(ua)) return 'Android Device';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Linux/.test(ua)) return 'Linux PC';
    return 'Unknown Device';
  }

  async function initPushNotification() {
    log('=== Iniciando initPushNotification ===');

    log('Verificando suporte...');
    log('- serviceWorker:', 'serviceWorker' in navigator);
    log('- PushManager:', 'PushManager' in window);
    log('- Notification:', 'Notification' in window);
    
    if (!('serviceWorker' in navigator)) {
      warn('Service Worker não suportado');
      return;
    }

    if (!('PushManager' in window)) {
      warn('Push API não suportada');
      return;
    }

    if (!('Notification' in window)) {
      warn('Notifications API não suportada');
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      warn('VAPID_PUBLIC_KEY não configurada');
      return;
    }
    
    log('Suporte OK, verificando usuário...');

    const user = await getUserPushSettings();
    log('Resultado getUserPushSettings:', user);
    
    if (!user) {
      log('Usuário não autenticado ou erro ao buscar configurações');
      return;
    }

    log('User push_enabled:', user.push_enabled, 'tipo:', typeof user.push_enabled);
    
    if (!user.push_enabled) {
      log('Push notifications desabilitadas para este usuário');
      return;
    }

    log('Usuário tem push_enabled=true, verificando subscription...');

    try {
      log('Registrando Service Worker em /push-notification-sw/sw.js ...');
      const registration = await navigator.serviceWorker.register('/push-notification-sw/sw.js', {
        scope: '/'
      });
      log('Service Worker registrado:', registration.scope);
      log('Service Worker state:', registration.active?.state || registration.installing?.state || registration.waiting?.state);

      log('Aguardando Service Worker estar pronto...');
      await navigator.serviceWorker.ready;
      log('Service Worker pronto');

      log('Verificando subscription existente...');
      let subscription = await registration.pushManager.getSubscription();
      log('Subscription existente:', subscription ? subscription.endpoint : 'nenhuma');

      if (subscription) {
        log('Subscription já existe, verificando se está registrada no backend...');
        await registerSubscription(subscription, getDeviceName());
        return;
      }

      log('Verificando permissão de notificação...');
      log('Notification.permission:', Notification.permission);
      
      if (Notification.permission === 'denied') {
        warn('Permissão de notificação negada pelo usuário');
        return;
      }

      if (Notification.permission === 'default') {
        log('Solicitando permissão de notificação...');
        const permission = await Notification.requestPermission();
        log('Resultado da solicitação:', permission);
        if (permission !== 'granted') {
          warn('Usuário negou permissão de notificação');
          return;
        }
        log('Permissão concedida!');
      }

      log('Criando nova subscription...');
      log('VAPID_PUBLIC_KEY length:', VAPID_PUBLIC_KEY.length);
      log('applicationServerKey (VAPID):', VAPID_PUBLIC_KEY.substring(0, 30) + '...');
      
      let applicationServerKey;
      try {
        applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
        log('applicationServerKey criada, byteLength:', applicationServerKey.byteLength);
      } catch (e) {
        error('Erro ao converter VAPID key para Uint8Array:', e);
        throw e;
      }
      
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey
      });

      log('Subscription criada:', subscription.endpoint);
      log('Subscription keys:', JSON.stringify(subscription.toJSON().keys));

      const registered = await registerSubscription(subscription, getDeviceName());
      if (registered) {
        log('✓ Push notification configurado com sucesso!');
      }

    } catch (e) {
      error('Erro ao configurar push notification:', e);
    }
  }

  function waitForDirectusAuth(maxWait) {
    maxWait = maxWait || 10000;
    const startTime = Date.now();
    
    return new Promise(function(resolve) {
      async function check() {
        if (Date.now() - startTime > maxWait) {
          log('Timeout aguardando autenticação');
          resolve(false);
          return;
        }
        
        // Verifica se o usuário está autenticado tentando buscar /users/me
        try {
          const response = await fetch(PUBLIC_URL + '/users/me?fields=id', {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            log('Usuário autenticado detectado!');
            resolve(true);
            return;
          }
        } catch (e) {
          // Ignora erros e continua tentando
        }
        
        setTimeout(check, 500);
      }
      check();
    });
  }

  async function main() {
    log('=== main() chamado ===');
    log('document.readyState:', document.readyState);
    
    if (document.readyState === 'loading') {
      log('DOM ainda carregando, aguardando DOMContentLoaded...');
      document.addEventListener('DOMContentLoaded', main);
      return;
    }

    log('DOM pronto, aguardando autenticação...');
    
    const isAuthenticated = await waitForDirectusAuth(10000);
    log('Autenticação resultado:', isAuthenticated);
    
    if (!isAuthenticated) {
      log('Timeout aguardando autenticação');
      return;
    }

    log('Autenticado! Iniciando push notification em 1 segundo...');
    
    setTimeout(initPushNotification, 1000);
  }

  let lastUrl = location.href;
  new MutationObserver(function() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      log('URL mudou para:', location.href);
      setTimeout(initPushNotification, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

  log('Chamando main()...');
  main();
})();
`;
}
