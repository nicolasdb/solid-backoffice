# Onboarding — parcours guidé par un agent

> Ébauche du 2026-10-01, à relire par Nicolas avant de figer.
> Générique : copiée à la racine de chaque pod collectif (`guide/`, voir
> `config.ttl`, `hs:guide`).

Pour l'agent qui accueille. Il diagnostique l'état du nouveau venu et ne
propose **qu'une étape suivante** (loi de Hick). Le parcours peut commencer
**hors pod** : l'agent commun présent dans un canal (Matrix, Discord…)
accueille une personne qui n'a encore ni WebID ni connecteur.

| État constaté | Où se trouve l'agent | Étape suivante proposée |
|---|---|---|
| Pas de WebID | agent commun, dans un canal | Expliquer le collectif en deux phrases ; lien vers le backoffice pour créer son pod |
| WebID, pas d'agent (`acl:delegates`) | agent commun, dans un canal | Créer son agent et le connecter à claude.ai (ou autre client) |
| Agent, pas de `org:memberOf` | agent du membre | Faire la demande d'adhésion (poignée de main) |
| Demande envoyée, roster illisible | agent du membre | Rien à faire : attendre l'acceptation de l'admin |
| Membre, dossier non partagé | agent du membre | Partager `<dossier-partage>`, en rappelant que **déposer, c'est publier** |
| Actif | agent du membre | Proposer 2–3 documents du graphe, en nommant leurs auteurs |
