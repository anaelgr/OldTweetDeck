# 🛡️ Rapport d'Audit Technique ELITE : OldTweetDeck

**Date de l'audit :** 20 octobre 2023
**Cible :** Extension Browser OldTweetDeck (Chrome MV3 / Firefox MV2)
**Niveau d'Audit :** ELITE (Deep Code Analysis, Security, Architecture)

---

## 1. Résumé Exécutif

Ce projet vise à restaurer l'ancienne interface de TweetDeck en interceptant et modifiant le comportement du client web Twitter/X. Bien que fonctionnel, **le projet présente des vulnérabilités de sécurité critiques** et des défauts architecturaux majeurs qui compromettent sa pérennité et la sécurité des utilisateurs.

L'approche repose sur des techniques agressives de "Monkey Patching" et d'injection de DOM, ce qui rend l'extension extrêmement fragile face aux mises à jour de X.com.

### 📊 Score de Santé du Projet
*   **Sécurité :** 🔴 **CRITIQUE** (Risque RCE avéré)
*   **Stabilité :** 🟠 **FRAGILE** (Dépendance forte aux structures internes de X)
*   **Maintenabilité :** 🟡 **MOYENNE** (Code minifié commité, logique complexe non documentée)
*   **Performance :** 🟢 **BONNE** (Mise en cache efficace, mais chargement initial bloquant)

---

## 2. 🚨 Audit de Sécurité (Priorité Maximale)

### 2.1. Injection de Code Distant (RCE) - 🔴 CRITIQUE
Le fichier `src/injection.js` télécharge et exécute du code JavaScript arbitraire provenant de sources externes (`raw.githubusercontent.com`, `oldtd.org`) via `innerHTML`.

*   **Le Problème :**
    ```javascript
    // src/injection.js
    const resources = [
        { remote: 'https://raw.githubusercontent.com/...' },
        // ...
    ];
    // ...
    scriptElement.innerHTML = scriptSource; // Exécution directe
    ```
*   **L'Impact :** Si le dépôt GitHub ou le domaine `oldtd.org` est compromis, un attaquant peut exécuter n'importe quel code dans le contexte de la session Twitter de l'utilisateur (vol de cookies, publication de tweets, DM, etc.).
*   **Recommandation :** **Interdire le chargement de scripts distants.** Tous les scripts nécessaires doivent être "bundlés" dans l'extension lors de la compilation.

### 2.2. Désactivation des Protections CSP - 🔴 CRITIQUE
Le fichier `ruleset.json` utilise l'API `declarativeNetRequest` pour supprimer les en-têtes de sécurité de Twitter.

*   **Le Problème :**
    ```json
    "responseHeaders": [
        { "header": "content-security-policy", "operation": "remove" },
        { "header": "x-frame-options", "operation": "remove" }
    ]
    ```
*   **L'Impact :** En supprimant la CSP, vous exposez l'utilisateur à des attaques XSS (Cross-Site Scripting) provenant non seulement de votre extension, mais potentiellement d'autres vecteurs sur le site Twitter lui-même.
*   **Recommandation :** Ne supprimez pas la CSP globalement. Si l'injection de scripts locaux est nécessaire, déclarez-les dans le `manifest.json` ou utilisez une CSP stricte qui autorise uniquement vos ressources.

### 2.3. Gestion des Secrets - 🟠 ÉLEVÉ
Le fichier `src/interception.js` contient des tokens "Bearer" hardcodés.
*   **Le Problème :** `const PUBLIC_TOKENS = ["Bearer AAAA..."];`
*   **L'Impact :** Si Twitter révoque ce token client public, l'extension cesse immédiatement de fonctionner pour tous les utilisateurs.
*   **Recommandation :** Il n'y a pas de solution parfaite pour un client tiers, mais envisager de récupérer ce token dynamiquement depuis le code source de la page si possible, ou prévoir un mécanisme de mise à jour à distance sécurisé (config remote).

---

## 3. 🏗️ Audit d'Architecture & Stabilité

### 3.1. Bug Logique dans `destroyer.js` - 🔴 CRITIQUE
Le script destiné à empêcher le chargement du nouveau Twitter contient un bug qui annule son effet.

*   **Le Code Défectueux :**
    ```javascript
    Array.prototype.push = function() {
        try {
            // ... logic to throw error ...
        } catch(e) {
            Array.prototype.push = _originalPush;
        } finally {
            return _originalPush.apply(this, arguments); // <--- S'EXÉCUTE TOUJOURS
        }
    }
    ```
*   **L'Analyse :** Le bloc `finally` s'exécute **toujours**, même après un `throw` (qui est attrapé) ou un `return`. Conséquence : le `push` original est toujours appelé, donc les scripts de Twitter sont chargés quand même. L'extension fonctionne probablement grâce à une "race condition" (vitesse d'exécution) plutôt que par un blocage effectif.
*   **Correction Immédiate :** Supprimer le `finally` ou conditionner l'appel original.

### 3.2. Fragilité de l'Interception API (`interception.js`) - 🟠 ÉLEVÉ
L'extension traduit manuellement les appels API v1.1 (Old TweetDeck) vers GraphQL (New Twitter).
*   **Analyse :** Cette couche est extrêmement complexe et fragile. Chaque changement de nom de variable ou de structure dans l'API GraphQL de X brisera l'extension.
*   **Recommandation :** Utiliser TypeScript pour définir les interfaces des réponses attendues et ajouter des tests unitaires sur les fonctions de parsing (`parseTweet`) pour détecter les régressions rapidement.

### 3.3. Stratégie "DOM Replacement" - 🟡 MOYEN
Le remplacement brutal via `document.documentElement.innerHTML` est efficace mais risqué.
*   **Observation :** L'utilisation de `MutationObserver` pour surveiller et nettoyer le DOM pendant 10 secondes est une solution de contournement ("hacky") gourmande en ressources.

---

## 4. 🧹 Qualité du Code & Maintenance

### 4.1. "Blob" Minifié dans le code source - 🟡 MOYEN
Le fichier `src/background_mv3.js` commence par un énorme bloc de code minifié (probablement issu de BetterTweetDeck).
*   **Impact :** Rend l'audit de ce fichier impossible et le débogage difficile. Ce code ne devrait pas être commité ainsi.
*   **Recommandation :** Intégrer le code source original de BetterTweetDeck dans le processus de build, ou le charger comme une librairie externe propre.

### 4.2. Logs de débogage en production - 🟢 FAIBLE
De nombreux `console.log` ("got extensionId", "state push") polluent la console.
*   **Recommandation :** Utiliser un logger conditionnel qui ne s'active qu'en mode développement.

---

## 5. ✅ Recommandations Stratégiques (Plan d'Action)

1.  **PATCH SÉCURITÉ (Immédiat) :**
    *   Supprimer la dépendance aux scripts distants. Télécharger `challenge.js` et `interception.js`, les inclure dans le repo et les charger via `chrome.runtime.getURL`.
    *   Corriger le bug dans `destroyer.js`.

2.  **REFONTE ARCHITECTURE (Moyen terme) :**
    *   Mettre en place un processus de build (Webpack/Vite) pour générer les fichiers finaux. Cela permettrait d'avoir un code source propre et modulaire, et de minifier uniquement à la fin.
    *   Migrer le code vers TypeScript pour sécuriser le parsing des APIs.

3.  **NETTOYAGE :**
    *   Nettoyer `background_mv3.js` pour séparer la logique "Legacy" de la logique "MV3".

---
*Fin du rapport.*
