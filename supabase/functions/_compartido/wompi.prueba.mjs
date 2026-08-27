// Pruebas de la verificación de firmas de Wompi.
//
// Correr con:   cd supabase/functions/_compartido && node wompi.prueba.mjs
//
// Node 24 ejecuta TypeScript directo, y wompi.ts a propósito no usa
// ninguna API de Deno: así la parte que decide si una activación es
// legítima se puede probar sin desplegar nada y sin tener llaves.
//
// La prueba que más importa es la segunda: comprueba que la cadena que
// arma nuestro código es byte por byte la del ejemplo de la documentación
// de Wompi. Si esa falla, todos los webhooks reales se rechazarían y
// nadie podría pagar, sin un solo error visible en la app.

const M = await import('./wompi.ts');
const { sha256, igualdadConstante, firmaIntegridad, porRuta, eventoEsAutentico, estadoParaLaBase } = M;

let ok = 0, mal = 0;
const t = (nombre, cond, extra = '') => { (cond ? ok++ : mal++); console.log(`${cond ? 'OK  ' : 'MAL '} ${nombre}${extra ? ' → ' + extra : ''}`); };

// 1. SHA256 contra vector conocido
t('sha256("abc")', await sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

// 2. La concatenación del evento es EXACTAMENTE la del ejemplo de la doc de Wompi
const SECRETO_DOC = 'prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z';
const ESPERADA = '1234-1610641025-49201APPROVED44900001530291411' + SECRETO_DOC;
const props = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
const data = { transaction: { id: '1234-1610641025-49201', status: 'APPROVED', amount_in_cents: 4490000 } };
const armada = props.map(p => String(porRuta(data, p))).join('') + '1530291411' + SECRETO_DOC;
t('concatenacion igual al ejemplo de la doc', armada === ESPERADA, armada === ESPERADA ? '' : armada);

// 3. Evento bien firmado se acepta
const mkEvento = async (d, ts = 1530291411) => {
  const cat = props.map(p => String(porRuta(d, p))).join('') + ts + SECRETO_DOC;
  return { event: 'transaction.updated', data: d, timestamp: ts, signature: { properties: props, checksum: await sha256(cat) } };
};
const bueno = await mkEvento(data);
t('evento legitimo se acepta', await eventoEsAutentico(bueno, SECRETO_DOC));

// 4. Cambiar el monto invalida la firma  ← lo que impide activarse gratis
const manipulado = JSON.parse(JSON.stringify(bueno));
manipulado.data.transaction.amount_in_cents = 100;
t('monto manipulado se rechaza', !(await eventoEsAutentico(manipulado, SECRETO_DOC)));

// 5. Secreto equivocado se rechaza
t('secreto equivocado se rechaza', !(await eventoEsAutentico(bueno, 'otro_secreto')));

// 6. Replay con otro timestamp se rechaza
const replay = JSON.parse(JSON.stringify(bueno)); replay.timestamp = 1530291412;
t('timestamp alterado se rechaza', !(await eventoEsAutentico(replay, SECRETO_DOC)));

// 7. Evento sin firma se rechaza
t('sin signature se rechaza', !(await eventoEsAutentico({ data, timestamp: 1 }, SECRETO_DOC)));
t('properties vacio se rechaza', !(await eventoEsAutentico({ data, timestamp: 1, signature: { properties: [], checksum: 'x' } }, SECRETO_DOC)));

// 8. Propiedad firmada que llega ausente se rechaza (no concatenar "undefined")
const faltante = JSON.parse(JSON.stringify(bueno)); delete faltante.data.transaction.status;
t('campo firmado ausente se rechaza', !(await eventoEsAutentico(faltante, SECRETO_DOC)));

// 9. properties dinamico: si Wompi agrega un campo, sigue funcionando
const props2 = [...props, 'transaction.currency'];
const data2 = { transaction: { ...data.transaction, currency: 'COP' } };
const cat2 = props2.map(p => String(porRuta(data2, p))).join('') + 1530291411 + SECRETO_DOC;
const ev2 = { event: 'transaction.updated', data: data2, timestamp: 1530291411, signature: { properties: props2, checksum: await sha256(cat2) } };
t('properties con campo nuevo sigue validando', await eventoEsAutentico(ev2, SECRETO_DOC));

// 10. Firma de integridad del checkout
const esperadaInt = await sha256('REF123' + 9900000 + 'COP' + 'secreto');
t('firmaIntegridad sin expiracion', await firmaIntegridad('REF123', 9900000, 'COP', 'secreto') === esperadaInt);
const esperadaExp = await sha256('REF123' + 9900000 + 'COP' + '2026-09-01T00:00:00.000Z' + 'secreto');
t('firmaIntegridad con expiracion', await firmaIntegridad('REF123', 9900000, 'COP', 'secreto', '2026-09-01T00:00:00.000Z') === esperadaExp);

// 11. igualdadConstante
t('igualdadConstante iguales', igualdadConstante('abc', 'abc'));
t('igualdadConstante distintos', !igualdadConstante('abc', 'abd'));
t('igualdadConstante largos distintos', !igualdadConstante('abc', 'abcd'));

// 12. Mapeo de estados
t('APPROVED mapea', estadoParaLaBase('APPROVED') === 'APPROVED');
t('DECLINED mapea', estadoParaLaBase('DECLINED') === 'DECLINED');
t('PENDING no se guarda', estadoParaLaBase('PENDING') === null);
t('estado inventado no se guarda', estadoParaLaBase('LO_QUE_SEA') === null);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
