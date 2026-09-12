-- Migration: Realtime per conversation_messages
-- 1. Aggiunge conversation_messages alla pubblicazione supabase_realtime
-- 2. Crea trigger su INSERT di conversation_messages che invoca realtime.send
--    per notificare istantaneamente i topic:
--      - 'conversation:' || conversation_id
--      - 'assignment:' || assignment_id (se driver_admin)
--      - 'campaign:' || campaign_id (se customer_admin)
--      - 'admin:messages'
-- 3. Crea trigger su UPDATE di seen_at per notificare l'avvenuta lettura.

BEGIN;

-- 1. Pubblicazione
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_messages;
  END IF;
END $$;

-- 2. Trigger Function INSERT
CREATE OR REPLACE FUNCTION public.on_conversation_message_inserted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_conv public.conversations%rowtype;
  v_payload jsonb;
BEGIN
  SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'id', NEW.id,
    'conversation_id', NEW.conversation_id,
    'sender_role', NEW.sender_role,
    'recipient_role', NEW.recipient_role,
    'text', NEW.text,
    'channel', NEW.channel,
    'created_at', NEW.created_at,
    'seen_at', NEW.seen_at,
    'issue_id', NEW.issue_id,
    'kind', v_conv.kind,
    'assignment_id', v_conv.assignment_id,
    'campaign_id', v_conv.campaign_id
  );

  -- Notifica la conversazione specifica
  PERFORM realtime.send(
    v_payload,
    'new_message',
    'conversation:' || NEW.conversation_id::text,
    false
  );

  -- Se conversazione Driver, notifica il canale dell'assignment
  IF v_conv.kind = 'driver_admin' AND v_conv.assignment_id IS NOT NULL THEN
    PERFORM realtime.send(
      v_payload,
      'new_message',
      'assignment:' || v_conv.assignment_id::text,
      false
    );
  END IF;

  -- Se conversazione Cliente, notifica il canale della campagna
  IF v_conv.kind = 'customer_admin' AND v_conv.campaign_id IS NOT NULL THEN
    PERFORM realtime.send(
      v_payload,
      'new_message',
      'campaign:' || v_conv.campaign_id::text,
      false
    );
  END IF;

  -- Notifica la centrale operativa Admin
  PERFORM realtime.send(
    v_payload,
    'new_message',
    'admin:messages',
    false
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_message_broadcast ON public.conversation_messages;
CREATE TRIGGER trg_conversation_message_broadcast
AFTER INSERT ON public.conversation_messages
FOR EACH ROW EXECUTE FUNCTION public.on_conversation_message_inserted();

-- 3. Trigger Function UPDATE (seen_at)
CREATE OR REPLACE FUNCTION public.on_conversation_message_updated()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_conv public.conversations%rowtype;
  v_payload jsonb;
BEGIN
  IF OLD.seen_at IS DISTINCT FROM NEW.seen_at THEN
    SELECT * INTO v_conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    v_payload := jsonb_build_object(
      'id', NEW.id,
      'conversation_id', NEW.conversation_id,
      'seen_at', NEW.seen_at,
      'recipient_role', NEW.recipient_role,
      'kind', v_conv.kind,
      'assignment_id', v_conv.assignment_id,
      'campaign_id', v_conv.campaign_id
    );

    IF v_conv.kind = 'driver_admin' AND v_conv.assignment_id IS NOT NULL THEN
      PERFORM realtime.send(v_payload, 'messages_seen', 'assignment:' || v_conv.assignment_id::text, false);
    END IF;
    IF v_conv.kind = 'customer_admin' AND v_conv.campaign_id IS NOT NULL THEN
      PERFORM realtime.send(v_payload, 'messages_seen', 'campaign:' || v_conv.campaign_id::text, false);
    END IF;
    PERFORM realtime.send(v_payload, 'messages_seen', 'conversation:' || NEW.conversation_id::text, false);
    PERFORM realtime.send(v_payload, 'messages_seen', 'admin:messages', false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_message_seen_broadcast ON public.conversation_messages;
CREATE TRIGGER trg_conversation_message_seen_broadcast
AFTER UPDATE OF seen_at ON public.conversation_messages
FOR EACH ROW EXECUTE FUNCTION public.on_conversation_message_updated();

COMMIT;
