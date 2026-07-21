const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://despachos-colderman-default-rtdb.firebaseio.com"
});

const db = admin.database();

function destinoLabel(d){
  if(d.destino === "provincia") return "Envío a provincia";
  if(d.destino === "oficina") return "Recepción en oficina";
  return "Recojo en bodega";
}

async function main(){
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

  const tokensSnap = await db.ref('fcmTokens').once('value');
  const tokensVal = tokensSnap.val() || {};
  const tokens = Object.keys(tokensVal);

  let maxTs = lastTs;
  for (const d of nuevos) {
    if ((d.ts || 0) > maxTs) maxTs = d.ts;
  }

  if (tokens.length === 0) {
    console.log('No hay dispositivos con notificaciones activadas. Se avanza el marcador igual.');
    await db.ref('meta/lastNotifiedTs').set(maxTs);
    return;
  }

  for (const d of nuevos) {
    const message = {
      notification: {
        title: 'Nuevo despacho',
        body: `${d.nombre || 'Cliente'} — ${destinoLabel(d)}`
      },
      tokens
    };
    try {
      const resp = await admin.messaging().sendEachForMulticast(message);
      console.log(`"${d.nombre}": ${resp.successCount} ok, ${resp.failureCount} fallidas`);
      const borrados = [];
      resp.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
            borrados.push(db.ref('fcmTokens/' + tokens[i]).remove());
          }
        }
      });
      if (borrados.length) await Promise.all(borrados);
    } catch (err) {
      console.error('Error enviando notificación:', err.message);
    }
  }

  await db.ref('meta/lastNotifiedTs').set(maxTs);
  console.log('Listo.');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err); process.exit(1); });
