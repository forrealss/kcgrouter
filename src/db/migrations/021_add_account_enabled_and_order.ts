export const id = 21;

// NOTE: the migration runner splits `sql` on ";" — keep comments free of
// semicolons or a comment-only chunk breaks the exec loop
export const sql = `
  -- Manual enable/disable, separate from the "status" column on purpose.
  --
  -- status is a tri-state (active/error/expired) driven by the error-recovery
  -- cycle, and recordAccountSuccess resets it to 'active'. An operator's
  -- decision to park a connection has to survive that, so it needs its own flag
  ALTER TABLE provider_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

  -- Explicit failover order within a provider, lowest first. handlePrefixRoute
  -- tries accounts in listAccounts order, so this is what makes the topmost
  -- connection the one used first
  ALTER TABLE provider_accounts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

  -- Seed the order from what the UI already showed (created_at DESC), so an
  -- upgrade does not silently reshuffle which connection serves traffic first.
  -- The correlated count is each row's position in that existing order, with id
  -- as the tiebreaker so rows sharing a timestamp still get distinct values
  UPDATE provider_accounts SET sort_order = (
    SELECT COUNT(*) FROM provider_accounts AS peer
    WHERE peer.provider_id = provider_accounts.provider_id
      AND (
        peer.created_at > provider_accounts.created_at
        OR (
          peer.created_at = provider_accounts.created_at
          AND peer.id > provider_accounts.id
        )
      )
  );

  -- listAccounts filters by provider and orders by sort_order on every request
  CREATE INDEX IF NOT EXISTS idx_provider_accounts_order
    ON provider_accounts(provider_id, sort_order);
`;
