const admin = require('firebase-admin');
const https = require('https');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://despachos-colderman-default-rtdb.firebaseio.com"
});

const db = admin.database();

function destinoLabel(d) {
  if (d.destino === "provincia") return d.agencia ? `Envío a región · ${d.agencia}` : "Envío a región";
  if (d.destino === "oficina") return "Recepción en oficina";
  return "Recojo en bodega";
}

function tipoCompraLabel(d) {
  return d.tipoCompra === "importacion" ? "Importación" : "Compra nacional";
}

function enviarNotificacionOneSignal(titulo, mensaje) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["Total Subscriptions"],
      headings: { en: titulo, es: titulo },
      contents: { en: mensaje, es: mensaje }
    });

    const req = https.request(
      {
        hostname: 'onesignal.com',
        path: '/api/v1/notifications',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ status: res.statusCode, body: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    console.error('Faltan las variables ONESIGNAL_APP_ID o ONESIGNAL_REST_API_KEY.');
    process.exit(1);
  }

  const metaSnap = await db.ref('meta/lastNotifiedTs').once('value');
  const lastTs = metaSnap.val() || 0;

  const snap = await db.ref('despachos').once('value');
  const val = snap.val() || {};
  const nuevos = Object.entries(val)
    .map(([k, v]) => ({ ...v, fbKey: k }))
    .filter(d => (d.ts || 0) > lastTs)
    .sort((a, b) => (a.ts || 0) - (b.ts || 0));

  if (nuevos.length === 0) {
    console.log('Sin despachos nuevos desde la última revisión.');
    return;
  }

  console.log(`Encontrados ${nuevos.length} despacho(s) nuevo(s).`);

  let maxTs = lastTs;
  for (const d of nuevos) {
    if ((d.ts || 0) > maxTs) maxTs = d.ts;
  }

  for (const d of nuevos) {
    const titulo = 'Nuevo despacho';
    const mensaje = `${d.nombre || 'Cliente'} · ${tipoCompraLabel(d)} · ${destinoLabel(d)}`;
    try {
      const resp = await enviarNotificacionOneSignal(titulo, mensaje);
      console.log(`"${d.nombre}": HTTP ${resp.status}`, JSON.stringify(resp.body));
    } catch (err) {
      console.error(`Error enviando notificación para "${d.nombre}":`, err.message);
    }
  }

  await db.ref('meta/lastNotifiedTs').set(maxTs);
  console.log('Listo.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
