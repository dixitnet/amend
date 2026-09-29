# Sauvegarde d'amend.ink — mise en place

*30/09/2026. Analyse et raisons : `claude/conception-sauvegarde.md`.*

Trois choses existent :

1. **Le bouton du back-office** (« Télécharger la sauvegarde ») : un
   `tar.gz` de `data/` pris à chaud. C'est le geste « je prends tout avant
   de faire une bêtise ».
2. **La copie régulière tirée par une autre machine** (ce document) : le
   NAS vient chercher les données et les secrets chaque nuit, par SSH, et
   garde 7 quotidiennes, 4 hebdomadaires, 4 jeux de secrets.
3. **L'essai de restauration** (`tools/essai-restauration.mjs`) : relit une
   archive avec le code de l'application et dit si elle se restaure.

**Le principe qui commande tout** : la copie est *tirée*, jamais
*poussée*. La production ne détient aucun identifiant de la machine de
sauvegarde ; si elle est prise, elle ne peut pas effacer ses propres
sauvegardes. Et la clé que le NAS utilise n'ouvre, côté production, que
quatre mots : `donnees`, `secrets`, `signaler` — le reste est refusé
(`deploy/sauvegarde-serveur.sh`, testé par
`server/test/copie-distante.test.js`).

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
