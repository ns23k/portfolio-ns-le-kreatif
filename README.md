# Ns_le Kréatif : portfolio, espace admin et devis

Ton portfolio, avec en plus :

- **un espace administrateur** (`/admin.html`) pour ajouter, modifier, masquer, réordonner et supprimer tes créas, et choisir celles qui passent dans le slider de l'accueil ;
- **la gestion des devis** : chaque demande du formulaire est enregistrée. Tu y réponds depuis l'admin, avec un prix en F CFA, des réponses rapides et un envoi en 1 clic sur WhatsApp ou par email ;
- **une page de suivi pour le client** (`/suivi.html`) : avec son code (ex. `NK-7QH2LM`) et son email, il voit ta réponse et le prix, peut **accepter ou refuser le devis**, ou te répondre.

Les données sont stockées dans **MySQL sur TiDB Cloud**. Le serveur est en Node.js (Express).

```
ns-le-kreatif/
├── public/                 ← le site (HTML, CSS, JS, images)
│   ├── index.html          ← portfolio (créas chargées depuis la base)
│   ├── suivi.html          ← suivi de devis côté client
│   ├── admin.html          ← espace administrateur
│   ├── css/  js/  images/
├── src/                    ← serveur : API, sécurité, emails
├── api/index.js            ← point d'entrée pour Vercel
├── scripts/
│   ├── schema.sql          ← tables MySQL
│   ├── init-db.js          ← test de connexion (les tables se créent toutes seules)
│   └── seed-works.json
├── server.js               ← lancement local / Render
├── vercel.json
└── .env.example            ← modèle de configuration
```

---

## 1. Créer la base sur TiDB Cloud (gratuit)

1. Va sur **tidbcloud.com**, crée un compte, puis un cluster **Serverless / Starter** (gratuit). Choisis la région la plus proche (Francfort `eu-central-1` par exemple).
2. Ouvre le cluster puis **Connect**. Choisis *Connect With : General*, clique sur **Generate Password** et note le mot de passe (il ne s'affiche qu'une fois).
3. Note les informations affichées : **host** (`gateway01….tidbcloud.com`), **port** `4000`, **user** (`xxxxxxx.root`).
4. Dans **SQL Editor**, exécute :
   ```sql
   CREATE DATABASE nslekreatif;
   ```

## 2. Configurer et tester sur ton ordinateur

Il faut **Node.js 18 ou plus** (nodejs.org).

```bash
cd ns-le-kreatif
cp .env.example .env        # sous Windows : copy .env.example .env
```

Ouvre `.env` et remplis :

| Variable | Valeur |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | les infos TiDB de l'étape 1 |
| `DB_NAME` | `nslekreatif` |
| `DB_SSL` | `true` (obligatoire pour TiDB) |
| `ADMIN_USER` / `ADMIN_PASSWORD` | ton identifiant et un **mot de passe long et unique** |
| `SESSION_SECRET` | une longue chaîne aléatoire (voir ci-dessous) |
| `SITE_URL` | l'adresse finale du site (utilisée dans les liens envoyés aux clients) |

Pour générer `SESSION_SECRET` :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Puis :
```bash
npm install
npm start            # au premier lancement, les tables sont créées et tes 57 créas importées automatiquement
```

- Site : http://localhost:3000
- Admin : http://localhost:3000/admin.html

## 3. Mettre en ligne

### Option A : Vercel (recommandé, gratuit)

1. Mets le dossier sur **GitHub** (le fichier `.env` est exclu automatiquement par `.gitignore`, c'est voulu).
2. Sur **vercel.com**, choisis *Add New Project*, importe le dépôt, puis **Framework : Other**. Ne touche pas aux réglages de build.
3. Dans **Settings → Environment Variables**, ajoute **toutes** les variables de ton `.env` (sauf `PORT`). Mets `SITE_URL` sur l'adresse Vercel, par ex. `https://ns-le-kreatif.vercel.app`.
4. Clique sur **Deploy**.

> Rien à lancer à la main : au premier appel, le serveur crée les tables dans TiDB et importe tes créas. (`npm run db:init` existe si tu veux tester la connexion depuis ton ordinateur.)

### Option B : Render

*New → Web Service*, puis relie le dépôt GitHub.
- Build command : `npm install`
- Start command : `npm start`
- Ajoute les mêmes variables d'environnement.

(Sur l'offre gratuite de Render, le site met environ 30 s à se réveiller après une période d'inactivité.)

## 4. Emails automatiques (facultatif)

Sans configuration, tout fonctionne : après chaque réponse, l'admin te propose **« Envoyer sur WhatsApp »** ou **« Envoyer par email »** avec le message et le lien de suivi déjà rédigés.

Pour que les emails partent tout seuls (confirmation au client, notification pour toi à chaque nouvelle demande, envoi de tes réponses) avec Gmail :

1. Active la **validation en 2 étapes** sur ton compte Google.
2. Va dans *Compte Google → Sécurité → Mots de passe des applications* et crée-en un.
3. Ajoute dans `.env` (et sur Vercel ou Render) :
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=465
   SMTP_USER=etudeetudiant123@gmail.com
   SMTP_PASS=le-mot-de-passe-d-application
   MAIL_FROM="Ns_le Kréatif <etudeetudiant123@gmail.com>"
   ADMIN_NOTIFY_EMAIL=etudeetudiant123@gmail.com
   ```

## 5. Utiliser l'admin au quotidien

**Créations**
- **+ Ajouter une créa** : glisse une image, donne un titre, choisis la catégorie. L'image est compressée automatiquement (1800 px max) avant l'envoi.
- ⭐ : met la créa dans le slider de l'accueil. 👁 : la masque ou la publie sans la supprimer.
- 🗑 : supprime la créa. Il faut **cliquer deux fois** pour confirmer.
- **Ordre** : sur ordinateur, glisse la poignée ⋮⋮ en haut à droite de la carte. Sur téléphone, utilise les flèches ← →. Ça marche sur la vue « Toutes », sans recherche ni filtre.
- La catégorie **Design sport** alimente la section Sport du site. Les autres alimentent le Portfolio, et les filtres s'affichent seulement pour les catégories qui contiennent des créas.

**Devis**
- Les nouvelles demandes ont un point jaune, et leur nombre s'affiche à côté de « Devis ».
- Ouvre une demande, utilise une **réponse rapide** (accusé de réception, proposition de prix, besoin de précisions, projet livré), indique le **montant**, puis **Envoyer la réponse**.
- Le statut se met à jour tout seul : *Nouvelle → En étude → Devis envoyé*, puis *Acceptée* ou *Refusée* quand le client répond. Tu peux aussi le changer à la main (*Livrée*, *Archivée*…).
- **Lien de suivi** copie l'adresse à envoyer au client si besoin.
- Le tableau de bord affiche le total des devis acceptés en F CFA.

## Changer son identifiant ou son mot de passe

Dans l'admin, va dans **Mon compte** (menu de gauche, ou onglet « Compte » sur mobile) :
- modifie l'identifiant et/ou saisis un nouveau mot de passe (10 caractères minimum, lettres + chiffres) ;
- valide avec ton **mot de passe actuel**.

Le mot de passe est chiffré (scrypt) dans la base. Tu restes connecté sur l'appareil utilisé ; tous les autres appareils sont déconnectés.

**Mot de passe oublié ?** Dans Vercel → Settings → Environment Variables, ajoute `ADMIN_RESET` = `1` puis redéploie : la connexion revient à `ADMIN_USER` / `ADMIN_PASSWORD`. Choisis un nouveau mot de passe dans « Mon compte », puis **supprime `ADMIN_RESET`** et redéploie.

## Sécurité

- Le mot de passe admin n'est **jamais** écrit dans le code : au départ il vient des variables d'environnement, puis il est stocké chiffré (scrypt) dès que tu le changes dans « Mon compte ».
- La session est stockée dans un cookie sécurisé (`HttpOnly`, `SameSite=Strict`) et dure 12 h.
- Après 8 mauvais mots de passe, la connexion est bloquée 15 minutes.
- Le formulaire de devis est limité à 6 envois par IP toutes les 10 minutes et contient un piège anti-robots.
- Un client ne voit sa demande qu'avec **son code et son email**.
- `admin.html` n'est pas indexé par Google.

## Si le serveur est injoignable

Le portfolio continue d'afficher tes créas grâce à une copie de secours (`public/js/works-fallback.json`). Le formulaire de devis propose alors d'envoyer la demande par email, comme sur l'ancien site.
