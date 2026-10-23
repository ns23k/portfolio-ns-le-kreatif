-- ============================================================
--  Ns_le Kréatif — schéma MySQL / TiDB Cloud
--  (exécuté automatiquement par `npm run db:init`)
-- ============================================================

CREATE TABLE IF NOT EXISTS works (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200)  NOT NULL,
  cat         VARCHAR(30)   NOT NULL,              -- affiche | logo | carte | brochure | mockup | sport
  cat_label   VARCHAR(100)  NOT NULL,              -- libellé affiché (ex. "Affiche évènement")
  description TEXT          NULL,
  image_url   VARCHAR(500)  NOT NULL,              -- /images/x.jpg ou /api/media/12
  media_id    INT           NULL,                  -- image envoyée depuis l'admin
  featured    TINYINT(1)    NOT NULL DEFAULT 0,    -- affichée dans le slider d'accueil
  published   TINYINT(1)    NOT NULL DEFAULT 1,
  position    INT           NOT NULL DEFAULT 0,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_works_cat (cat, position)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS media (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  mime       VARCHAR(50)  NOT NULL,
  bytes      INT          NOT NULL,
  data       MEDIUMBLOB   NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(16)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(190) NOT NULL,
  phone        VARCHAR(40)  NULL,
  project_type VARCHAR(60)  NOT NULL,
  budget       VARCHAR(60)  NULL,
  deadline     VARCHAR(60)  NULL,
  message      TEXT         NOT NULL,
  status       VARCHAR(20)  NOT NULL DEFAULT 'nouveau', -- nouveau | en_cours | devis_envoye | accepte | refuse | termine | archive
  price        INT          NULL,                       -- montant proposé en F CFA
  unread_admin TINYINT(1)   NOT NULL DEFAULT 1,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quotes_code (code),
  KEY idx_quotes_status (status, created_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_messages (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  quote_id   INT          NOT NULL,
  author     VARCHAR(10)  NOT NULL,                    -- admin | client
  body       TEXT         NOT NULL,
  price      INT          NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_qm_quote (quote_id, created_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
