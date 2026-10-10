# Sauvegarde d'amend.ink — mise en place

*30/09/2026. Analyse et raisons : `claude/conception-sauvegarde.md`.*

Quatre choses existent :

1. **Le bouton du back-office** (« Télécharger la sauvegarde ») : un
   `tar.gz` de `data/` pris à chaud. C'est le geste « je prends tout avant
   de faire une bêtise ».
2. **La copie régulière tirée par une autre machine** (ce document) : le
   NAS vient chercher les données et les secrets chaque nuit, par SSH, et
   garde 7 quotidiennes, 4 hebdomadaires, 4 jeux de secrets.
3. **L'envoi quotidien vers Proton Drive** (§8) : le VPS fabrique lui-même
   une archive chaque nuit et la pousse sur Proton avec leur CLI officiel.
   C'est la copie « hors de chez soi » ; elle s'ajoute à celle du NAS,
   elle ne la remplace pas.
4. **L'essai de restauration** (`tools/essai-restauration.mjs`) : relit une
   archive avec le code de l'application et dit si elle se restaure.

**Le principe qui commande tout** (§1 à §7, la copie du NAS) : la copie est
*tirée*, jamais *poussée*. La production ne détient aucun identifiant de la machine de
sauvegarde ; si elle est prise, elle ne peut pas effacer ses propres
sauvegardes. Et la clé que le NAS utilise n'ouvre, côté production, que
trois mots : `donnees`, `secrets`, `signaler` — le reste est refusé
(`deploy/sauvegarde-serveur.sh`, testé par
`server/test/copie-distante.test.js`). **L'envoi vers Proton (§8) fait
exception à ce principe, en connaissance de cause** : c'est la production
qui pousse, donc elle détient une session Proton. Les parades sont au §8.4.

---

## 1. Sur la machine de sauvegarde (le NAS)

```bash
# Une clé dédiée, sans phrase secrète (le timer ne peut pas la taper)
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_amend_sauvegarde -N "" -C "nas-sauvegarde-amend"
cat ~/.ssh/id_ed25519_amend_sauvegarde.pub      # à copier pour l'étape 2
```

## 2. Sur la production (SSH, utilisateur `amend`)

Après un `git pull` qui apporte `deploy/sauvegarde-serveur.sh` :

```bash
chmod +x /opt/amend/app/deploy/sauvegarde-serveur.sh
nano ~/.ssh/authorized_keys
```

Ajouter **une ligne** (le préfixe est ce qui enferme la clé — ne pas le
retirer) :

```
restrict,command="/opt/amend/app/deploy/sauvegarde-serveur.sh" ssh-ed25519 AAAA…(la clé publique du NAS) nas-sauvegarde-amend
```

`restrict` coupe le terminal, les redirections de port, l'agent SSH ;
`command=` fait que, quoi que la clé demande, seul ce script s'exécute.

Pour confirmer l'empreinte de la production avant de lui faire confiance
(à faire une fois) :

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

## 3. De retour sur le NAS

```bash
mkdir -p ~/bin ~/.config
# copier deploy/tirer-sauvegarde.sh dans ~/bin/ (scp depuis le Mac, ou git)
chmod +x ~/bin/tirer-sauvegarde.sh

cat > ~/.config/amend-sauvegarde.conf <<'CONF'
HOTE=amend@92.243.27.71
CLE=$HOME/.ssh/id_ed25519_amend_sauvegarde
DEST=/nas/backups/amend
CONF
chmod 600 ~/.config/amend-sauvegarde.conf

# Faire connaître l'hôte, puis COMPARER l'empreinte avec celle de l'étape 2
ssh-keyscan -t ed25519 92.243.27.71 >> ~/.ssh/known_hosts
ssh-keygen -lf ~/.ssh/known_hosts | tail -1

# Premier passage à la main
~/bin/tirer-sauvegarde.sh
ls -lh /nas/backups/amend/quotidiennes /nas/backups/amend/secrets
```

Puis le timer (nuit, 3 h 30, rattrapage si le NAS était éteint) :

```bash
sudo cp amend-sauvegarde.service amend-sauvegarde.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now amend-sauvegarde.timer
systemctl list-timers amend-sauvegarde.timer
```

## 4. Vérifier que ça se voit

Au back-office, sous « Sauvegarde », une ligne dit *« Dernière copie tirée
par la machine de sauvegarde : il y a N h »* — et passe en rouge au-delà
de 36 h, ou si aucune copie n'a jamais été signalée. C'est le signal qui
compte : une sauvegarde qui s'arrête en silence est pire que pas de
sauvegarde.

Du côté du NAS : `~/bin/tirer-sauvegarde.sh age` sort en erreur si la
dernière sauvegarde a plus de 36 h (utile pour Home Assistant ou tout
outil de supervision), et `/nas/backups/amend/sauvegarde.log` garde
l'historique, `dernier-echec` la dernière raison d'échec.

## 5. L'essai de restauration — à faire UNE fois, maintenant

Sur le Mac (le code de l'application y est), avec une archive rapatriée du
NAS :

```bash
scp syg@<nas>:/nas/backups/amend/quotidiennes/amend-AAAAMMJJ-HHMMSS.tar.gz /tmp/
cd ~/Documents/collabtext-test/collabtext
node tools/essai-restauration.mjs /tmp/amend-AAAAMMJJ-HHMMSS.tar.gz
```

Il déplie dans un dossier jetable, rejoue chaque journal, dit combien de
documents et de signes il retrouve, et sort avec un code non nul si quelque
chose ne se relit pas. Refaire cet essai après chaque changement du
format des données, et de temps en temps « pour voir ».

## 6. Restaurer pour de vrai

```bash
sudo systemctl stop amend
mv /opt/amend/data /opt/amend/data.avant-restauration
tar xzf amend-AAAAMMJJ-HHMMSS.tar.gz -C /opt/amend     # se déplie en data/
# Seulement si la machine est neuve (ou le .env perdu) :
sudo tar xzf amend-secrets-AAAAMMJJ-HHMMSS.tar.gz -C /   # remet .env, Caddyfile, unité
sudo systemctl daemon-reload && sudo systemctl start amend
systemctl status amend --no-pager | head -8
```

Le dossier d'origine est conservé à côté : ne l'effacer qu'après avoir
vérifié que l'application répond et qu'un document s'ouvre.

**Sans le `.env` d'origine** : `SESSION_SECRET` change (tout le monde est
déconnecté) et sans `ADMIN_EMAILS` plus personne ne peut entrer. C'est
pour cela que les secrets sont sauvegardés — dans un dossier à part, en
mode 600.

## 7. Ce que ça ne couvre pas

- **La machine de sauvegarde elle-même** : si le NAS brûle avec la maison,
  il n'y a plus de sauvegarde. Les instantanés Gandi (console Gandi →
  serveur → Snapshots) couvrent l'autre cas, « le VPS a brûlé » ; les deux
  ensemble couvrent presque tout. Une copie du dossier
  `/nas/backups/amend` vers un stockage hors site est l'étape suivante, si
  le besoin s'en fait sentir.
- **Les secrets ne sont pas chiffrés sur le NAS** (mode 600, dossier 700).
  Le NAS est chez toi ; si un jour la copie sort de chez toi, la chiffrer
  d'abord (`age` ou `gpg`).
- **Une suppression volontaire** : si un document est supprimé, il reste
  dans les sauvegardes jusqu'à leur rotation (au plus quatre semaines). À
  savoir avant de promettre à quelqu'un que c'est « vraiment supprimé ».
- **Le point de restauration est celui de la nuit** : les modifications
  faites depuis 3 h 30 ne sont pas dans la dernière copie.

---

## 8. L'envoi quotidien vers Proton Drive (depuis le VPS)

*10/10/2026.* Chaque nuit à 4 h 15, `amend-proton.timer` lance
`deploy/sauvegarde-vers-proton.sh` sur le VPS, sous l'utilisateur `amend` :
il fabrique une archive des données et une des secrets (avec le même
`sauvegarde-serveur.sh` que celui que tire le NAS, donc le même contenu),
les vérifie, les envoie avec le CLI officiel `proton-drive`, **relit le
dossier distant pour s'assurer qu'elles y sont**, puis fait tourner. Les
données *et* les secrets partent, sans autre chiffrement que celui de
Proton (choix assumé ; voir §8.4). Testé par
`server/test/sauvegarde-vers-proton.test.js` (faux CLI).

### 8.1 Dans Proton Drive (une fois, à la main)

Le CLI n'a pas de commande de création de dossier documentée. Créer, dans
l'interface web de Proton Drive, avec le **compte dédié** (§8.4) :

```
Sauvegardes/amend/quotidiennes
Sauvegardes/amend/secrets
```

Le script les désigne par `/my-files/Sauvegardes/amend/…` (réglable avec
`PROTON_DEST`). Un dossier absent est un échec explicite du script, jamais
un envoi perdu en silence.

### 8.2 Sur le VPS (utilisateur `amend`)

1. **Installer le CLI** : télécharger le binaire `proton-drive` depuis la
   page officielle (<https://proton.me/support/drive-cli>), le poser dans
   `/home/amend/bin/` et le rendre exécutable. Vérifier : `~/bin/proton-drive --help`.
2. **Ouvrir la session une fois** : `~/bin/proton-drive auth login`.
   Sur un serveur sans navigateur, le CLI affiche une adresse à ouvrir sur
   un autre appareil ; l'aide du CLI (`auth login --help`) fait foi.
   Le CLI range sa session dans un « coffre » (trousseau, `pass` ou fichier) :
   sur un serveur sans trousseau graphique, deux possibilités —
   - `export PROTON_DRIVE_CREDENTIALS_STORE=pass` (avec `pass` + `gpg`, clé
     sans phrase secrète, puisque le timer ne peut pas la taper) ;
   - `export PROTON_DRIVE_CREDENTIALS_STORE=unsafe_file` (un fichier de
     session dans le dossier de l'utilisateur ; moins propre, plus simple).
   Dans les deux cas, cette ligne va aussi dans le fichier de réglages
   ci-dessous, pour que le timer retrouve la session. Si le CLI exige un bus
   de session, mettre `PROTON_PREFIXE="dbus-run-session --"`.
3. **Le fichier de réglages** `~/.config/amend-proton.conf` (mode 600) :

   ```bash
   PROTON_CLI=/home/amend/bin/proton-drive
   export PROTON_DRIVE_CREDENTIALS_STORE=pass
   #PROTON_PREFIXE="dbus-run-session --"
   # DEST=/opt/amend/sauvegardes        # archives gardées ici (défaut)
   # GARDER_LOCAL=2                     # archives gardées ici, par nature
   # PROTON_RM="..."                    # voir §8.5 — vide par défaut
   ```

4. **Un premier passage à la main**, en regardant :

   ```bash
   /opt/amend/app/deploy/sauvegarde-vers-proton.sh
   /opt/amend/app/deploy/sauvegarde-vers-proton.sh age     # 0 = un envoi récent existe
   ls -la /opt/amend/sauvegardes/quotidiennes
   ```

   Vérifier dans Proton Drive que les deux fichiers sont arrivés, puis
   **essayer de les rapatrier et de les ouvrir** (§8.6) — une sauvegarde
   jamais relue n'est qu'une hypothèse.
5. **Le minuteur** (en administrateur) :

   ```bash
   sudo cp /opt/amend/app/deploy/amend-proton.{service,timer} /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now amend-proton.timer
   systemctl list-timers amend-proton.timer
   ```

   Mémoire : le VPS a 1 Go et l'application y tourne. Au premier passage,
   regarder `free -m` et `journalctl -u amend-proton -n 30` ; l'unité tourne
   déjà en `Nice=19` / E/S « idle ». Si le CLI fait tomber le serveur
   (OOM), déplacer l'heure ou ajouter un peu de swap avant de renoncer.

### 8.3 Voir que ça marche

- **Le back-office** (Serveur) affiche « Dernier envoi sur Proton Drive : il
  y a N h », en alerte au-delà de 36 h — à côté de la ligne de la copie du
  NAS. Rien n'est affiché tant que l'envoi n'a jamais réussi.
- Sur le VPS : `deploy/sauvegarde-vers-proton.sh age` (code 1 au-delà de
  36 h, pour une supervision), `/opt/amend/sauvegardes/sauvegarde-proton.log`
  (l'historique), `dernier-echec-proton` (la dernière raison d'échec,
  effacée au passage réussi suivant).
- Un échec n'abîme rien : l'archive reste ici, et la nuit suivante envoie
  tout ce qui manque. Une archive nettement plus petite que la précédente
  (moins de 40 %) est mise de côté en `.suspecte` et **ne part pas** : mieux
  vaut une sauvegarde manquante, signalée, qu'une bonne remplacée par un
  disque vide.

### 8.4 Ce que ça change pour la sécurité — à lire

- **Le VPS détient une session Proton.** Quiconque prend le VPS peut lire
  *et effacer* les sauvegardes qui s'y trouvent. D'où : un **compte Proton
  dédié** à amend (pas le compte personnel), avec la double authentification,
  qui ne contient que ce dossier. La copie tirée par le NAS (§1 à §7) reste
  la copie que la production ne peut pas atteindre : **ne pas la
  supprimer**.
- **Les secrets partent sans autre chiffrement que celui de Proton**
  (chiffrement de bout en bout du Drive). C'est un choix : le compte dédié
  porte la protection. Si ce compte est un jour partagé ou rattaché à autre
  chose, ajouter un chiffrement `age` avant l'envoi.
- La session Proton vit dans le dossier de l'utilisateur `amend`
  (`unsafe_file`) ou dans son trousseau `pass`. Dans les deux cas, le
  `.env` de l'application est déjà au même endroit : le niveau de risque
  s'ajoute, il ne change pas de nature.

### 8.5 La rotation sur Proton

Par défaut, **le script ne supprime rien sur Proton** : les envois s'y
accumulent (une archive de données par nuit). Le CLI n'a pas de commande de
suppression documentée ; tant qu'on n'a pas dit laquelle utiliser, rien
n'est effacé, et c'est à toi de faire le ménage de temps en temps dans
l'interface web.

Quand une commande de suppression est connue et essayée à la main, la
renseigner dans `~/.config/amend-proton.conf` :

```bash
PROTON_RM="/home/amend/bin/proton-drive filesystem delete"   # à vérifier avec --help
```

Le script l'appelle avec le chemin distant complet de chaque fichier à
retirer et garde sur Proton : les **7 dernières quotidiennes**, plus les
**4 dernières archives du dimanche** parmi les plus anciennes, et **4 jeux
de secrets** (réglable : `GARDER_PROTON_QUOTIDIENNES`,
`GARDER_PROTON_HEBDOMADAIRES`, `GARDER_PROTON_SECRETS`). Une suppression
refusée est signalée et retentée le lendemain.

### 8.6 Restaurer depuis Proton

Récupérer l'archive voulue — dans l'interface web de Proton Drive, ou avec
le CLI (`proton-drive filesystem download …`, voir son aide) — puis suivre le
§5 (essai) ou le §6 (restauration), qui s'appliquent tels quels : ce sont les
mêmes archives que celles du NAS.

### 8.7 Ce que ça ne couvre pas

- Un VPS **et** un compte Proton pris ensemble : c'est la raison de garder
  la copie du NAS, qu'aucun des deux ne touche.
- La session Proton qui expire (changement de mot de passe, révocation) :
  l'envoi échoue, le back-office passe en alerte au bout de 36 h, il faut
  refaire `proton-drive auth login` (§8.2).
