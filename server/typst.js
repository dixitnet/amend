// Rendu PDF par Typst — le bac à sable, côté serveur.
//
// Le client fabrique la source (client/src/typstExport.js) et la poste ; ce
// module la compile. Typst est un binaire unique en Rust, appelé en
// sous-processus : ni interpréteur, ni bibliothèque système, ni paquet npm —
// c'est la plus petite entorse possible à un backend qui n'a aucune
// dépendance de production.
//
// Le vrai risque n'est pas la vitesse (209 pages A5 rendues en 2,1 s au
// prototype) mais un document pathologique : un ticket ouvert chez Typst
// rapporte 41 Go de mémoire et quatorze minutes sur 300 pages à renvois
// croisés. Sur un VPS d'un gigaoctet, un seul suffirait à faire tuer le
// processus par le noyau et à emporter Amend avec lui. D'où quatre
// garde-fous, dont aucun n'est facultatif :
//
//   1. un plafond mémoire dur — le sous-processus meurt, pas le serveur ;
//   2. un délai maximal — ce qui dépasse trente secondes ne finira pas ;
//   3. une file d'un seul rendu à la fois — un vCPU, un export ;
//   4. un dossier racine isolé, qui ne contient que ce document.
//
// Voir claude/proto-export-pdf-typst-pagedjs.md pour les mesures.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { famillesTypst } from '../shared/style.js'

export class TypstError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.status = status
  }
}

const DEFAUTS = {
  binaire: 'typst',
  memoireMo: 400,
  delaiMs: 30_000,
  // Une source de plus d'un mégaoctet n'est pas un document, c'est un
  // problème. Le plus gros testé — 524 000 signes, 209 pages — pesait
  // 531 ko de Typst.
  sourceMaxOctets: 2 * 1024 * 1024,
}

export class Typst {
  constructor({ binaire, memoireMo, delaiMs, polices } = {}) {
    this.binaire = binaire || process.env.TYPST_BIN || DEFAUTS.binaire
    this.memoireMo = Number(memoireMo || process.env.TYPST_MEMORY_MB) || DEFAUTS.memoireMo
    this.delaiMs = Number(delaiMs || process.env.TYPST_TIMEOUT_MS) || DEFAUTS.delaiMs
    // Les polices d'Amend plutôt que celles du système : le PDF sort
    // identique quelle que soit la machine. `--ignore-system-fonts` sans
    // dossier fourni priverait Typst de tout, y compris de ses polices
    // embarquées — on ne l'ajoute donc que si on a de quoi le remplacer.
    this.polices = polices || process.env.TYPST_FONT_PATH || null
    this.sourceMaxOctets = DEFAUTS.sourceMaxOctets
    // File d'attente : un rendu à la fois. Le VPS a un seul vCPU, et trois
    // exports simultanés se le disputeraient avec l'application elle-même.
    this._enCours = Promise.resolve()
    this._attente = 0
  }

  /** Nombre de rendus en attente — exposé pour le back-office. */
  get attente() {
    return this._attente
  }

  /** `true` si le binaire répond. Appelé au démarrage pour le dire une fois
   * plutôt qu'à chaque export. */
  async disponible() {
    try {
      const version = await this._executer([this.binaire, '--version'], { delaiMs: 5000 })
      return version.code === 0 ? version.sortie.trim() : null
    } catch {
      return null
    }
  }

  /** Les familles de polices que la mise en page peut demander, et que
   * cette machine **n'a pas** (18/09/2026).
   *
   * Typst remplace en silence une famille absente. Sur un serveur sans
   * polices installées, il ne reste que ce qu'il embarque — Libertinus
   * Serif, New Computer Modern, DejaVu Sans *Mono* — et « Système
   * (sans-serif) » sort donc en serif, sans un mot. C'est invisible dans
   * les journaux, invisible dans le code, et parfaitement visible dans le
   * PDF de la personne qui avait choisi autre chose.
   *
   * On le dit donc une fois, au démarrage. Ce n'est pas une erreur — le PDF
   * sort quand même, et les listes de repli de POLICES limitent les dégâts —
   * mais c'est ce qu'il faut savoir avant de chercher ailleurs.
   */
  async policesManquantes() {
    let installees
    try {
      const r = await this._executer([this.binaire, 'fonts'], { delaiMs: 10_000 })
      if (r.code !== 0) return null
      installees = new Set(
        r.sortie
          .split('\n')
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean)
      )
    } catch {
      return null
    }
    return famillesTypst().filter((f) => !installees.has(f.toLowerCase()))
  }

  /**
   * Compile `source` et renvoie le PDF (Buffer).
   * `images` : `[{ nom, chemin }]` — déposées dans `images/` à côté de la
   * source, seul endroit que `--root` laisse atteindre.
   */
  async rendre(source, { images = [] } = {}) {
    if (typeof source !== 'string' || !source.trim()) {
      throw new TypstError('source vide', 400)
    }
    if (Buffer.byteLength(source, 'utf8') > this.sourceMaxOctets) {
      throw new TypstError('document trop volumineux à composer', 413)
    }
    if (this._attente >= 3) {
      throw new TypstError('trop de rendus en attente, réessayez dans un instant', 503)
    }
    this._attente++
    // Chaîne de promesses : chaque rendu attend le précédent, et une erreur
    // ne casse pas la file pour les suivants.
    const place = this._enCours.then(
      () => this._rendreMaintenant(source, images),
      () => this._rendreMaintenant(source, images)
    )
    this._enCours = place.catch(() => {})
    try {
      return await place
    } finally {
      this._attente--
    }
  }

  async _rendreMaintenant(source, images) {
    const racine = mkdtempSync(join(tmpdir(), 'amend-typst-'))
    try {
      writeFileSync(join(racine, 'main.typ'), source, 'utf8')
      if (images.length) {
        const dossier = join(racine, 'images')
        mkdirSync(dossier)
        for (const img of images) {
          if (!/^[A-Za-z0-9_-]+\.(png|jpg)$/.test(img.nom)) continue
          if (existsSync(img.chemin)) copyFileSync(img.chemin, join(dossier, img.nom))
        }
      }

      const args = [
        'compile',
        '--root', racine,
        ...(this.polices ? ['--font-path', this.polices, '--ignore-system-fonts'] : []),
        'main.typ',
        'sortie.pdf',
      ]
      const r = await this._executer([this.binaire, ...args], { cwd: racine })

      if (r.tue === 'delai') throw new TypstError('la composition a dépassé le temps imparti', 504)
      if (r.tue === 'memoire') throw new TypstError('ce document est trop complexe à composer', 507)
      if (r.code !== 0) {
        // Le message de Typst désigne la ligne fautive de la source, donc
        // du code qu'on a nous-mêmes engendré : utile dans les journaux,
        // incompréhensible pour qui lit. On ne renvoie que la première
        // ligne, et on garde le reste côté serveur.
        console.error('Typst a refusé la source :', r.erreur.slice(0, 2000))
        const premiere = (r.erreur.split('\n').find((l) => l.includes('error:')) || '').trim()
        throw new TypstError(premiere ? `composition impossible — ${premiere}` : 'composition impossible', 422)
      }

      const pdf = join(racine, 'sortie.pdf')
      if (!existsSync(pdf)) throw new TypstError('aucun PDF produit', 500)
      return readFileSync(pdf)
    } finally {
      rmSync(racine, { recursive: true, force: true })
    }
  }

  /** Lance le binaire sous plafond mémoire et sous délai. Le plafond passe
   * par `ulimit -v` dans un shell intermédiaire : pas de dépendance, et ça
   * marche là où systemd-run n'est pas disponible (le Mac de développement,
   * les tests). */
  _executer(commande, { cwd, delaiMs } = {}) {
    const limite = delaiMs || this.delaiMs
    return new Promise((resolve, reject) => {
      const ligne = commande.map((a) => `'${String(a).replace(/'/g, "'\\''")}'`).join(' ')
      const enfant = spawn('/bin/sh', ['-c', `ulimit -v ${this.memoireMo * 1024} 2>/dev/null; exec ${ligne}`], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let sortie = ''
      let erreur = ''
      let tue = null
      enfant.stdout.on('data', (d) => {
        sortie += d
      })
      enfant.stderr.on('data', (d) => {
        // On borne : un message d'erreur de Typst peut être très long, et
        // il n'a pas à faire grossir la mémoire du serveur.
        if (erreur.length < 64 * 1024) erreur += d
      })
      const minuteur = setTimeout(() => {
        tue = 'delai'
        enfant.kill('SIGKILL')
      }, limite)
      enfant.on('error', (e) => {
        clearTimeout(minuteur)
        reject(new TypstError(`Typst est introuvable sur ce serveur (${e.message})`, 501))
      })
      enfant.on('close', (code, signal) => {
        clearTimeout(minuteur)
        // Un dépassement de `ulimit -v` se manifeste par une allocation
        // refusée : le processus meurt, souvent sans code propre.
        if (!tue && (signal === 'SIGKILL' || /memory allocation|out of memory|Killed/i.test(erreur))) tue = 'memoire'
        resolve({ code, signal, sortie, erreur, tue })
      })
    })
  }
}
