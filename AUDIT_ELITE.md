# 🛡️ Audit Technique ELITE : OldTweetDeck

**Date :** 18 Octobre 2023
**Version Auditée :** 4.3.9
**Type d'Audit :** Sécurité, Architecture, Performance & Qualité de Code
**Auteur :** Jules (AI Software Engineer)

---

## 1. 📋 Résumé Exécutif

OldTweetDeck est une prouesse d'ingénierie inverse qui parvient à restaurer une interface obsolète en traduisant dynamiquement les appels API vers la nouvelle infrastructure GraphQL de X (Twitter). Cependant, cette fonctionnalité repose sur une **architecture de sécurité extrêmement fragile et permissive**.

L'extension contourne délibérément presque tous les mécanismes de sécurité modernes des navigateurs (CSP, Isolation des contextes) et introduit plusieurs vecteurs d'Exécution de Code à Distance (RCE) critiques. Bien que fonctionnelle, elle présente un risque élevé pour la confidentialité et la sécurité des comptes utilisateurs si l'infrastructure du développeur (ou GitHub) venait à être compromise.

---

## 2. 🏗️ Analyse Architecturale

L'extension fonctionne selon un modèle "Parasite & Remplacement" :

1.  **Injection & Destruction (`destroyer.js`, `injection.js`)** :
    -   L'extension s'exécute au chargement du document (`document_start`) et bloque agressivement le chargement de l'application Twitter moderne (React/SPA) en "tuant" `Array.prototype.push` et en interceptant les définitions `webpackChunk`.
    -   Elle remplace le DOM entier (`document.documentElement.innerHTML`) par une version statique locale (`files/index.html`).

2.  **Pont API (`interception.js`)** :
    -   Le cœur du système est un **Monkey-Patching global de `XMLHttpRequest`**.
    -   L'extension intercepte les requêtes de l'ancien client TweetDeck (API v1.1) et les réécrit à la volée pour interroger les endpoints GraphQL privés de X.
    -   Elle effectue une transformation massive des données JSON pour faire correspondre le format GraphQL au format attendu par le vieux client TweetDeck.

3.  **Syncro Cookies (`background3.js`)** :
    -   Un Service Worker synchronise brutalement les cookies entre `x.com` et `twitter.com` pour maintenir la session active, contournant les frontières de domaine standard.

---

## 3. 🚨 Audit de Sécurité (Niveau : CRITIQUE)

L'audit révèle plusieurs failles majeures classées par sévérité.

### 🔴 CRITIQUE : Suppression de la Content Security Policy (CSP)
Le fichier `ruleset.json` utilise l'API `declarativeNetRequest` pour supprimer les en-têtes `content-security-policy` et `x-frame-options` des réponses de Twitter.
-   **Impact :** Cela désactive la première ligne de défense contre les attaques XSS. Toute injection de script sur la page (par l'extension ou une autre source) s'exécutera sans restriction.

### 🔴 CRITIQUE : Exécution de Code à Distance (RCE)
Le fichier `injection.js` récupère des scripts critiques (`vendor.js`, `bundle.js`, `interception.js`) directement depuis **GitHub Raw** (`raw.githubusercontent.com`) et les injecte via `innerHTML` ou `eval`.
-   **Risque :** Si le dépôt GitHub est compromis ou si un attaquant parvient à modifier ces fichiers, il peut exécuter du code arbitraire sur le navigateur de tous les utilisateurs de l'extension instantanément. C'est une violation flagrante des bonnes pratiques Manifest V3 (bien que techniquement possible via le retrait de la CSP).
-   **Vecteur secondaire :** `fetch("https://oldtd.org/api/scripts")` télécharge et exécute également des scripts supplémentaires arbitraires. C'est un canal "Command & Control" (C2) actif.

### 🟠 ÉLEVÉ : Exposition des Cookies (HttpOnly)
L'extension lit les cookies `auth_token` (normalement `HttpOnly` et inaccessibles au JS) via le background script (`chrome.cookies`) et les envoie au contexte de la page (Main World) via `postMessage`.
-   **Impact :** Cela brise la protection `HttpOnly`. Tout script malveillant s'exécutant sur la page peut intercepter ce message et voler la session de l'utilisateur.

### 🟠 ÉLEVÉ : XSS Stockée via les Notifications
Le module `notifications.js` récupère un JSON depuis `oldtd.org` et injecte le contenu du champ `text` directement dans le DOM via `innerHTML` sans sanitization adéquate.
-   **Impact :** Une réponse malveillante du serveur `oldtd.org` peut injecter du JavaScript dans le contexte de l'extension (et donc de la page, vu le contexte d'exécution).

### 🟡 MOYEN : Dépendance Tierce pour l'Authentification
La résolution des challenges cryptographiques (pour éviter d'être banni par Twitter) est déléguée à une iframe tierce (`tweetdeck.dimden.dev/solver.html`) via `challenge.js`.
-   **Risque :** L'extension envoie des données internes à ce domaine. Si ce domaine est compromis, le processus d'authentification est vulnérable.

---

## 4. ⚡ Performance et Stabilité

-   **Gestion DOM :** L'utilisation de `MutationObserver` dans `destroyer.js` pour supprimer les messages d'erreur est efficace mais la méthode de destruction des scripts Twitter (via surcharge de `Array.prototype.push`) est extrêmement "sale" et peut causer des boucles infinies ou des crashs du navigateur si Twitter change son chargeur Webpack.
-   **Mise en cache :** L'implémentation "Stale-While-Revalidate" manuelle dans `injection.js` pour les ressources distantes est une bonne idée pour la performance, mais elle manque de validation d'intégrité (Subresource Integrity - SRI).
-   **Réseau :** La traduction des requêtes API (polling vs streaming) ajoute une latence et une surcharge CPU non négligeable lors du parsing des réponses GraphQL géantes.

---

## 5. 🛠️ Qualité du Code & Maintenabilité

-   **Complexité Cyclomatique :** Le fichier `interception.js` est monolithique et contient une logique de parsing JSON fragile (`extractAssignedJSON`). Si Twitter change la structure de ses réponses GraphQL (ce qui arrive souvent), l'extension cassera immédiatement.
-   **Hacks Prototype :** La modification des prototypes natifs (`Array`, `RegExp`, `XMLHttpRequest`) est une pratique de développement dangereuse qui peut créer des conflits imprévisibles avec d'autres extensions ou scripts.
-   **Build Process :** Le script `pack.js` est ingénieux, permettant de maintenir une base de code unique pour Chrome (MV3) et Firefox (MV2) en patchant le manifeste à la volée.

---

## 6. 🎯 Recommandations

1.  **Sanitization :** Implémenter impérativement une librairie de sanitization (ex: DOMPurify) avant toute injection via `innerHTML`, en particulier pour les notifications et les scripts distants.
2.  **Validation d'Intégrité :** Utiliser des hashs SRI pour vérifier que les scripts téléchargés depuis GitHub n'ont pas été altérés.
3.  **Isolation :** Déplacer la logique sensible (gestion des tokens) hors du "Main World" autant que possible, en utilisant le "Isolated World" des Content Scripts pour protéger les cookies.
4.  **Réduction de la Surface d'Attaque :** Supprimer la dépendance à `oldtd.org` pour l'exécution de scripts arbitraires.
5.  **CSP :** Tenter de rétablir une CSP minimale au lieu de la supprimer totalement, ou utiliser des nonces pour les scripts injectés.

---
*Fin du rapport.*
