import { describe, it, expect } from 'vitest';
import { MAX_BYTES, MAX_POR_MASCOTA, revisarArchivo, traducirErrorSql } from './limites.js';

// Un archivo es, para esta función, tres datos. No hace falta un File.
const pdf = (size) => ({ name: 'examen.pdf', type: 'application/pdf', size });

describe('revisarArchivo · el tamaño', () => {
  it('acepta exactamente 5 MB', () => {
    expect(revisarArchivo(pdf(MAX_BYTES), 0)).toEqual({ ok: true });
  });

  // El byte de más es el caso que importa: un `<` donde va un `<=` rechaza
  // el archivo que el mensaje promete aceptar.
  it('rechaza un byte más, y el motivo dice cuánto pesa y qué hacer', () => {
    const r = revisarArchivo(pdf(MAX_BYTES + 1), 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('5');
    expect(r.motivo).toContain('blanco y negro');
  });

  it('nombra el tamaño real en MB con coma decimal', () => {
    const r = revisarArchivo(pdf(12 * 1048576), 0);
    expect(r.motivo).toContain('12,0 MB');
  });

  // Un PDF de 0 bytes no se abre y nadie sabe por qué. Es el caso del
  // escáner que se quedó a mitad.
  it('rechaza un archivo vacío', () => {
    const r = revisarArchivo(pdf(0), 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('vacío');
  });
});

describe('revisarArchivo · el tipo', () => {
  // Lo que atrapa: la clínica eligió una foto del celular, con su nombre
  // .jpg de verdad. NO atrapa un .jpg renombrado a .pdf — el navegador
  // deriva `type` de la extensión, así que el renombrado llega diciendo
  // application/pdf. Ver la sección 9 del spec.
  it('rechaza lo que el navegador reporta como imagen', () => {
    const r = revisarArchivo({ name: 'foto.jpg', type: 'image/jpeg', size: 1000 }, 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('PDF');
  });

  it('rechaza un tipo vacío sin decir "undefined"', () => {
    const r = revisarArchivo({ name: 'raro', type: '', size: 1000 }, 0);
    expect(r.ok).toBe(false);
    expect(r.motivo).not.toContain('undefined');
  });

  it('rechaza que no haya archivo', () => {
    expect(revisarArchivo(null, 0).ok).toBe(false);
    expect(revisarArchivo(undefined, 0).ok).toBe(false);
  });
});

describe('revisarArchivo · el cupo de la mascota', () => {
  it('con nueve ya subidos, el décimo pasa', () => {
    expect(revisarArchivo(pdf(1000), MAX_POR_MASCOTA - 1)).toEqual({ ok: true });
  });

  it('con diez, no pasa, y el motivo dice que hay que borrar uno', () => {
    const r = revisarArchivo(pdf(1000), MAX_POR_MASCOTA);
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('borrá');
  });

  // El cupo se mira ANTES que el tamaño: en una mascota llena, volver a
  // escanear más liviano no sirve de nada, y el mensaje del tamaño
  // mandaría a la clínica a hacer justo eso.
  it('en una mascota llena, el motivo habla del cupo y no del tamaño', () => {
    const r = revisarArchivo(pdf(MAX_BYTES + 1), MAX_POR_MASCOTA);
    expect(r.motivo).toContain('borrá');
    expect(r.motivo).not.toContain('blanco y negro');
  });
});

describe('traducirErrorSql', () => {
  // El trigger de 015 levanta un nombre seco. Esta es la función que lo
  // convierte en la misma frase que habría dicho el chequeo del frontend
  // si hubiera tenido el conteo al día.
  it('traduce el freno del trigger', () => {
    const f = traducirErrorSql('new row violates ... limite_archivos_mascota');
    expect(f).toContain('borrá');
  });

  it('traduce el check del peso', () => {
    const f = traducirErrorSql('violates check constraint "archivos_mascota_peso_bytes_check"');
    expect(f).toContain('5');
  });

  it('traduce el check del tipo de documento', () => {
    const f = traducirErrorSql('violates check constraint "archivos_mascota_tipo_check"');
    expect(f).toBe('Ese tipo de documento no existe. Elegí uno de la lista.');
  });

  it('traduce el check de la fecha del documento', () => {
    const f = traducirErrorSql('violates check constraint "archivos_mascota_fecha_documento_iso"');
    expect(f).toBe('La fecha del documento no quedó bien. Usá el calendario del campo.');
  });

  it('traduce el check de la ruta única', () => {
    const f = traducirErrorSql('violates unique constraint "archivos_mascota_ruta_key"');
    expect(f).toBe('Ese archivo ya se había subido. Actualizá la página para verlo.');
  });

  // Un error que esta versión no conoce devuelve null, para que el
  // llamador muestre el de Postgres crudo. Inventarle una frase sería
  // tapar el único caso nuevo.
  it('devuelve null para lo que no conoce', () => {
    expect(traducirErrorSql('could not connect')).toBe(null);
    expect(traducirErrorSql('')).toBe(null);
    expect(traducirErrorSql(null)).toBe(null);
  });
});
