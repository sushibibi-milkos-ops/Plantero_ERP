import { describe, expect, it } from 'vitest';
import {
  Blend, Boxes, CircleDot, Combine, Droplets, Funnel, GlassWater, Layers, Leaf, Milk, Nut, Package, PackageCheck,
  Pipette, Scale, ShieldCheck, Tag, Waves, Wheat, Wine, Candy, Dumbbell,
} from 'lucide-react';
import { GENERIC_PROCESS, LINE_PROCESSES, iconForNode, stepsFor } from '../bom-flow-model';

const mat = (type: 'raw' | 'packaging' | 'semi' | 'finished', name: string) => iconForNode({ kind: 'material', type, name });

describe('iconForNode', () => {
  it('kuruyemiş/püre → Nut, tahıl → Wheat, yağ → Droplets, su → GlassWater, şeker → Candy, protein → Dumbbell', () => {
    expect(mat('raw', 'Badem Püresi')).toBe(Nut);
    expect(mat('raw', 'Kaju')).toBe(Nut);
    expect(mat('raw', 'Fındık')).toBe(Nut);
    expect(mat('raw', 'Yulaf Unu')).toBe(Wheat);
    expect(mat('raw', 'Ayçiçek Yağı')).toBe(Droplets);
    expect(mat('raw', 'Su')).toBe(GlassWater);
    expect(mat('raw', 'Hurma Şurubu')).toBe(Candy);
    expect(mat('raw', 'Whey Protein İzolat')).toBe(Dumbbell);
    expect(mat('raw', 'Peanut Butter')).toBe(Nut);
  });

  it('ambalaj: cam şişe → Wine, plastik şişe → Milk, kapak → CircleDot, etiket → Tag, emniyet bandı → ShieldCheck, koli → Package, saşe → Pipette', () => {
    expect(mat('packaging', 'Cam Şişe Baştürk Cam Hale 250ml')).toBe(Wine);
    expect(mat('packaging', 'PET Şişe 1L')).toBe(Milk);
    expect(mat('packaging', 'Tarihli Gold 38mm Twistoff Kapak')).toBe(CircleDot);
    expect(mat('packaging', 'Yeniler Etiket Badem Konsantresi 250g')).toBe(Tag);
    expect(mat('packaging', '38 Çap Emniyet Bandı')).toBe(ShieldCheck);
    expect(mat('packaging', "Koli 6'lı")).toBe(Package);
    expect(mat('packaging', 'Saşe 10g')).toBe(Pipette);
    expect(mat('packaging', 'Bilinmeyen Malzeme')).toBe(Package);
  });

  it('ambalaj adındaki hammadde kelimesi ambalaj kuralını bozmaz (etiket "Badem" içerir)', () => {
    expect(mat('packaging', 'Etiket Badem')).toBe(Tag);
  });

  it('tip kuralları: yarı mamul → Layers, mamul → PackageCheck, bilinmeyen hammadde → Leaf', () => {
    expect(mat('semi', 'Badem Bazı 250ml')).toBe(Layers);
    expect(mat('finished', 'Badem Sütü Konsantresi')).toBe(PackageCheck);
    expect(mat('raw', 'Xyz 123')).toBe(Leaf);
  });

  it('süreç adımları', () => {
    const p = (key: string, label: string) => iconForNode({ kind: 'process', key, label });
    expect(p('mix', 'Karıştırma')).toBe(Blend);
    expect(p('powder-mix', 'Toz karıştırma')).toBe(Combine);
    expect(p('homogenize', 'Homojenizasyon')).toBe(Waves);
    expect(p('fill', 'Dolum')).toBe(Funnel);
    expect(p('sachet-fill', 'Saşe/stick dolum')).toBe(Pipette);
    expect(p('cap-label', 'Kapama & Etiket')).toBe(Tag);
    expect(p('boxing', 'Kutulama')).toBe(Boxes);
    expect(p('weigh', 'Tartım')).toBe(Scale);
  });
});

describe('stepsFor', () => {
  it('hat bilgisi yoksa genel süreç', () => {
    expect(stepsFor(null, 'finished', false)).toEqual(GENERIC_PROCESS);
    expect(stepsFor('HAT9', 'semi', false)).toEqual(GENERIC_PROCESS);
  });
  it('yarı mamulsüz mamul tüm hat adımlarını gösterir', () => {
    expect(stepsFor('HAT1', 'finished', false).map((s) => s.label)).toEqual(['Karıştırma', 'Homojenizasyon', 'Dolum', 'Kapama & Etiket']);
    expect(stepsFor('hat3', 'finished', false)).toEqual(LINE_PROCESSES.HAT3);
  });
  it('yarı mamul: hazırlık adımları; yarı mamullü mamul: dolum adımları', () => {
    expect(stepsFor('HAT1', 'semi', false).map((s) => s.label)).toEqual(['Karıştırma', 'Homojenizasyon']);
    expect(stepsFor('HAT1', 'finished', true).map((s) => s.label)).toEqual(['Dolum', 'Kapama & Etiket']);
    expect(stepsFor('HAT2', 'semi', false).map((s) => s.label)).toEqual(['Tartım', 'Toz karıştırma']);
  });
});
