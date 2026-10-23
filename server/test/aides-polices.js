// Des « polices » minimales pour les tests (24/10/2026) : l'en-tête et les
// tables que server/polices.js lit (`head`, `cmap`, `name`, `OS/2`, `post`,
// un dessin de lettres), sans aucun glyphe. Elles ne s'afficheront nulle part ;
// elles servent à vérifier ce que le serveur en lit et en refuse.

function table(octets) {
  return Buffer.from(octets)
}

function nom(famille, { sousFamille = 'Regular', typographique = false, licence = 'SIL Open Font License 1.1' } = {}) {
  const enregistrements = []
  const ajouter = (id, texte) => enregistrements.push({ id, donnees: Buffer.from(texte, 'utf16le').swap16() })
  // En OpenType, l'identifiant 1 porte la famille « de style » (« Foo Bold »)
  // et le 16 la famille complète : on imite les deux cas.
  ajouter(1, typographique ? `${famille} ${sousFamille}` : famille)
  ajouter(2, sousFamille)
  if (typographique) {
    ajouter(16, famille)
    ajouter(17, sousFamille)
  }
  ajouter(13, licence)
  const entete = 6 + enregistrements.length * 12
  const tete = Buffer.alloc(entete)
  tete.writeUInt16BE(0, 0)
  tete.writeUInt16BE(enregistrements.length, 2)
  tete.writeUInt16BE(entete, 4)
  let decalage = 0
  enregistrements.forEach((e, i) => {
    const r = 6 + i * 12
    tete.writeUInt16BE(3, r) // plateforme Windows
    tete.writeUInt16BE(1, r + 2) // encodage Unicode BMP
    tete.writeUInt16BE(0x409, r + 4) // anglais américain
    tete.writeUInt16BE(e.id, r + 6)
    tete.writeUInt16BE(e.donnees.length, r + 8)
    tete.writeUInt16BE(decalage, r + 10)
    decalage += e.donnees.length
  })
  return Buffer.concat([tete, ...enregistrements.map((e) => e.donnees)])
}

/** `options` : famille, sousFamille, poids, italique, fsType, typographique,
 * monospace, panose (serifStyle), variable, collection, cff, signature, licence. */
export function fabriquerPolice({
  famille = 'Famille Test',
  sousFamille = 'Regular',
  poids = 400,
  italique = false,
  fsType = 0,
  typographique = false,
  monospace = false,
  serifStyle = 2,
  variable = false,
  cff = false,
  signature,
  licence,
  remplissage = 0,
} = {}) {
  const head = Buffer.alloc(54)
  head.writeUInt16BE(italique ? 2 : 0, 44)
  const os2 = Buffer.alloc(78)
  os2.writeUInt16BE(poids, 4)
  os2.writeUInt16BE(fsType, 8)
  os2[32] = 2
  os2[33] = serifStyle
  os2.writeUInt16BE(italique ? 1 : 0, 62)
  const post = Buffer.alloc(32)
  post.writeUInt32BE(monospace ? 1 : 0, 12)
  const tables = {
    head,
    cmap: table([0, 0, 0, 0]),
    name: nom(famille, { sousFamille, typographique, licence }),
    'OS/2': os2,
    post,
    [cff ? 'CFF ' : 'glyf']: Buffer.alloc(16 + remplissage, 1),
  }
  if (variable) tables.fvar = Buffer.alloc(16)
  const etiquettes = Object.keys(tables).sort()
  const entete = Buffer.alloc(12 + etiquettes.length * 16)
  entete.write(signature ?? (cff ? 'OTTO' : '\u0000\u0001\u0000\u0000'), 0, 'latin1')
  entete.writeUInt16BE(etiquettes.length, 4)
  let position = entete.length
  const corps = []
  etiquettes.forEach((t, i) => {
    const r = 12 + i * 16
    entete.write(t, r, 'latin1')
    entete.writeUInt32BE(position, r + 8)
    entete.writeUInt32BE(tables[t].length, r + 12)
    corps.push(tables[t])
    position += tables[t].length
  })
  return Buffer.concat([entete, ...corps])
}
