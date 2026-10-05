"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Query, tcgdex, type TCGdexPriceableCard } from "./lib/tcgdex";
import { supabase } from "./lib/supabase";
import { getOAuthReturnUrl } from "./lib/auth";

type Card = { id?: string; recordId?: string; ownerId?: string; hasToTrade?: boolean; name: string; set: string; number: string; rarity: string; price?: number | null; priceUnit?: "EUR" | "GBP"; marketEur?: number | null; image?: string; dataLoaded?: boolean; color: string; owners: string[]; wanted: number; };
type SetOption = { id: string; name: string; logo?: string; cardCount: { total: number; official: number }; releaseDate?: string; };
type EventData = { name: string; date: string; time: string; location: string; };
type Person = { id: string; initials: string; name: string; color: string; cards: string[] };

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, React.ReactNode> = {
    plus: <><path d="M12 5v14M5 12h14" /></>, share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></>,
    search: <><circle cx="10.8" cy="10.8" r="7"/><path d="m16 16 4.5 4.5"/></>, calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>, close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    check: <><path d="m5 12 4 4L19 6"/></>, link: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setSignInError(error.message);
      setUser(data.session?.user ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  async function signInWithDiscord() {
    if (!supabase) return;
    setSigningIn(true); setSignInError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: getOAuthReturnUrl(), scopes: "identify" },
    });
    if (error) { setSignInError(error.message); setSigningIn(false); }
  }

  if (!authReady) return <main className="auth-shell"><div className="auth-card"><span className="brand-mark"><span/><span/><span/><span/></span><p>Loading TradeTable…</p></div></main>;
  if (!supabase || !user) return <main className="auth-shell"><div className="auth-card"><a href="#home" className="brand"><span className="brand-mark"><span/><span/><span/><span/></span><span>trade<span className="brand-accent">table</span></span></a><div className="micro-label">TRADE NIGHTS, TOGETHER</div><h1>Sign in to your<br/><em>trade table.</em></h1><p>Your trade nights and card lists are saved to your account and shared only with people who join the night.</p>{!supabase ? <div className="auth-error">Add the Supabase project URL and publishable key to <code>.env.local</code>.</div> : <button className="discord-button" onClick={() => void signInWithDiscord()} disabled={signingIn}>{signingIn ? "Opening Discord…" : "Continue with Discord"}</button>}{signInError && <div className="auth-error">{signInError}</div>}<small>We use Discord sign-in. TradeTable does not ask for or store your password.</small></div></main>;
  return <TradeTable user={user} onSignOut={async () => { await supabase.auth.signOut(); }} />;
}

function TradeTable({ user, onSignOut }: { user: User; onSignOut: () => Promise<void> }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [event, setEvent] = useState<EventData>({ name: "My trade night", date: "", time: "", location: "" });
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventOwnerId, setEventOwnerId] = useState<string | null>(null);
  const [creatingNight, setCreatingNight] = useState(false);
  const [tradeNights, setTradeNights] = useState<{ id: string; event: EventData }[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [dbError, setDbError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Everyone");
  const [modal, setModal] = useState<"event" | "card" | "share" | null>(null);
  const [notice, setNotice] = useState("");
  const [newCard, setNewCard] = useState("");
  const [sets, setSets] = useState<SetOption[]>([]);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [cardResults, setCardResults] = useState<TCGdexPriceableCard[]>([]);
  const [cardSearchLoading, setCardSearchLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [gbpRate, setGbpRate] = useState<number | null>(null);
  const [eventDraft, setEventDraft] = useState(event);
  const [inviteUrl, setInviteUrl] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      setDbError("");
      const invite = new URLSearchParams(window.location.search).get("invite");
      if (invite) {
        const { error } = await supabase.rpc("join_trade_night", { p_token: invite });
        if (error) setDbError(`Could not join this trade night: ${error.message}`);
        else window.history.replaceState({}, "", window.location.pathname);
      }
      const { data: memberships, error: memberError } = await supabase.from("trade_night_members").select("trade_night_id").eq("user_id", user.id);
      if (!alive) return;
      if (memberError) { setDbError(memberError.message); setDataReady(true); return; }
      const ids = (memberships || []).map((row) => row.trade_night_id as string);
      let nights: any[] = [];
      if (ids.length) {
        const { data, error } = await supabase.from("trade_nights").select("*").in("id", ids).order("created_at", { ascending: false });
        if (error) { setDbError(error.message); setDataReady(true); return; }
        nights = data || [];
      }
      if (!nights.length) {
        const { data, error } = await supabase.from("trade_nights").insert({ owner_id: user.id, name: "My trade night", location: "" }).select().single();
        if (error) { setDbError(error.message); setDataReady(true); return; }
        nights = [data];
      }
      if (!alive) return;
      setTradeNights(nights.map((night) => ({ id: night.id, event: dbNightToEvent(night) })));
      setEventId((current) => current || nights[0].id);
    })();
    return () => { alive = false; };
  }, [user.id]);

  useEffect(() => {
    if (!supabase || !eventId) return;
    let alive = true;
    setDataReady(false);
    (async () => {
      const [{ data: night, error: nightError }, { data: rows, error: cardsError }, { data: members, error: membersError }] = await Promise.all([
        supabase!.from("trade_nights").select("*").eq("id", eventId).single(),
        supabase!.from("trade_cards").select("*").eq("trade_night_id", eventId).order("created_at", { ascending: false }),
        supabase!.from("trade_night_members").select("user_id").eq("trade_night_id", eventId),
      ]);
      if (!alive) return;
      if (nightError || cardsError || membersError) {
        setDbError(nightError?.message || cardsError?.message || membersError?.message || "Could not load this trade night.");
        setDataReady(true); return;
      }
      if (night) { const nextEvent = dbNightToEvent(night); setEvent(nextEvent); setEventDraft(nextEvent); setEventOwnerId(night.owner_id); }
      const ids = (members || []).map((row) => row.user_id as string);
      setMemberIds(ids);
      setCards((rows || []).map((row) => ({
        recordId: row.id, ownerId: row.owner_id, id: row.tcgdex_id || undefined, name: row.name,
        set: row.set_name || "Pokémon TCG", number: row.card_number || "", rarity: row.rarity || "Pokémon card",
        image: row.image_url || undefined, color: row.color || colorForCard(row.name), owners: [row.owner_id === user.id ? "You" : `M${ids.indexOf(row.owner_id) + 1}`],
        wanted: row.wanted || 1, hasToTrade: row.has_to_trade, dataLoaded: false,
      })));
      setDbError(""); setDataReady(true);
    })();
    return () => { alive = false; };
  }, [eventId, user.id]);

  const people = useMemo<Person[]>(() => memberIds.map((id, index) => ({
    id,
    initials: id === user.id ? "YOU" : `M${index + 1}`,
    name: id === user.id ? "You" : `Member ${index + 1}`,
    color: ["blue", "pink", "green", "orange", "purple", "yellow"][index % 6],
    cards: cards.filter((card) => card.ownerId === id).map((card) => card.name),
  })), [memberIds, user.id, cards]);

  const myCards = useMemo(() => cards.filter((card) => card.ownerId === user.id), [cards, user.id]);

  async function selectNight(id: string) {
    setEventId(id);
    setCards([]); setMemberIds([]); setDataReady(false);
    const selected = tradeNights.find((night) => night.id === id);
    if (selected) { setEvent(selected.event); setEventDraft(selected.event); }
  }

  async function saveCardRow(card: Card, updates: { has_to_trade?: boolean } = {}) {
    if (!supabase || !eventId) return null;
    const payload = {
      trade_night_id: eventId, owner_id: user.id, tcgdex_id: card.id || null, name: card.name,
      set_name: card.set, card_number: card.number, rarity: card.rarity, image_url: card.image || null,
      color: card.color, wanted: card.wanted || 1, has_to_trade: card.hasToTrade || false, ...updates,
    };
    const query = card.recordId
      ? supabase.from("trade_cards").update(payload).eq("id", card.recordId).select().single()
      : supabase.from("trade_cards").insert(payload).select().single();
    const { data, error } = await query;
    if (error) { setDbError(error.message); return null; }
    setDbError("");
    return data;
  }
  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      tcgdex.set.list(),
      fetch("https://api.frankfurter.dev/v2/rate/eur/gbp").then((response) => {
        if (!response.ok) throw new Error("Could not load the latest EUR to GBP rate.");
        return response.json() as Promise<{ rate?: number }>;
      }),
    ]).then(([setResult, rateResult]) => {
      if (!alive) return;
      if (setResult.status === "fulfilled") setSets([...(setResult.value as SetOption[])].reverse());
      else setDataError("TCGdex data is temporarily unavailable. You can still use cards already on your list.");
      if (rateResult.status === "fulfilled" && typeof rateResult.value.rate === "number") setGbpRate(rateResult.value.rate);
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!modal || modal !== "card") return;
    let cancelled = false;
    setCardResults([]);
    const timer = window.setTimeout(async () => {
      if (!newCard.trim()) { setCardResults([]); setCardSearchLoading(false); return; }
      setCardSearchLoading(true);
      try {
        const query = Query.create().contains("name", newCard.trim()).paginate(1, 24);
        if (selectedSetId) query.equal("set.id", selectedSetId);
        const matches = await tcgdex.card.list(query);
        if (!cancelled) setCardResults(matches as TCGdexPriceableCard[]);
      } catch {
        if (!cancelled) { setDataError("Could not search TCGdex right now. Please try again in a moment."); setCardResults([]); }
      } finally { if (!cancelled) setCardSearchLoading(false); }
    }, 260);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [modal, newCard, selectedSetId]);
  useEffect(() => {
    let alive = true;
    const withData = cards.filter((card) => !card.dataLoaded);
    if (!withData.length || !sets.length) return;
    Promise.all(withData.map(async (summary) => {
      try {
        let data = summary.id ? await tcgdex.card.get(summary.id) : null;
        let imageSummary: { id: string; localId: string; name: string; image?: string; getImageURL(quality?: "low" | "high", extension?: "png" | "webp"): string } | null = null;
        const setBrief = sets.find((set) => set.name.toLowerCase() === summary.set.toLowerCase());
        if (!data || !(data as TCGdexPriceableCard).image) {
          const matches = await tcgdex.card.list(Query.create().contains("name", summary.name).paginate(1, 100));
          const nameMatches = matches.filter((candidate) => candidate.name.toLowerCase() === summary.name.toLowerCase());
          imageSummary = nameMatches.find((candidate) => candidate.id === summary.id)
            || (setBrief ? nameMatches.find((candidate) => candidate.id.startsWith(`${setBrief.id}-`)) : undefined)
            || nameMatches.find((candidate) => candidate.localId === summary.number)
            || null;
          if (!data && imageSummary) data = await tcgdex.card.get(imageSummary.id);
          if (!data && setBrief) {
            const fullSet = await tcgdex.set.get(setBrief.id);
            const cardInSet = fullSet?.cards.find((candidate) => candidate.name.toLowerCase() === summary.name.toLowerCase());
            if (cardInSet) {
              imageSummary ||= cardInSet;
              data = await cardInSet.getCard();
            }
          }
        }
        if (!data) {
          if (!imageSummary?.image) setDataError(`TCGdex did not return artwork for ${summary.name}.`);
          return imageSummary?.image ? { ...summary, id: imageSummary.id, number: `${imageSummary.localId}`, image: `${imageSummary.image}/low.webp`, dataLoaded: true } : null;
        }
        const fullCard = data as TCGdexPriceableCard;
        const details = { ...fullCard, image: fullCard.image || imageSummary?.image, set: fullCard.set || setBrief };
        return applyTCGdexDetails(summary, details, gbpRate);
      } catch {
        setDataError(`Could not load all saved cards from TCGdex. Try searching the card and adding its printing again.`);
        return null;
      }
    })).then((hydrated) => {
      if (!alive) return;
      const byId = new Map(hydrated.filter((card): card is Card => Boolean(card)).map((card) => [card.recordId || card.id, card]));
      if (byId.size) setCards((current) => current.map((card) => byId.get(card.recordId || card.id) ?? card));
    }).catch(() => {});
    return () => { alive = false; };
  }, [gbpRate, cards, sets]);
  useEffect(() => {
    if (gbpRate === null) return;
    setCards((current) => {
      let changed = false;
      const converted = current.map((card) => {
        if (typeof card.marketEur !== "number" || (card.priceUnit === "GBP" && card.price === card.marketEur * gbpRate)) return card;
        changed = true;
        return { ...card, price: card.marketEur * gbpRate, priceUnit: "GBP" as const };
      });
      return changed ? converted : current;
    });
  }, [gbpRate]);
  const visibleCards = useMemo(() => cards.filter((card) => {
    const textMatch = `${card.name} ${card.set} ${card.rarity}`.toLowerCase().includes(search.toLowerCase());
    const peopleMatch = filter === "Everyone" || people.find((person) => person.name === filter)?.cards.includes(card.name);
    return textMatch && peopleMatch;
  }), [cards, search, filter]);

  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 2600); }
  async function shareEvent() {
    if (!supabase || !eventId) return;
    const { data: token, error } = await supabase.rpc("create_trade_night_invite", { p_trade_night_id: eventId });
    if (error || !token) { setDbError(error?.message || "Could not create an invite link."); return; }
    const url = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(token)}`;
    setInviteUrl(url);
    if (navigator.share) void navigator.share({ title: event.name, text: `Come trade with us on ${formatDate(event.date)}!`, url }).catch(() => {});
    else void navigator.clipboard?.writeText(url).then(() => flash("Trade night invite link copied!")).catch(() => setModal("share"));
  }
  async function addTCGdexCard(summary: TCGdexPriceableCard) {
    try {
      const full = await tcgdex.card.get(summary.id);
      const selected = (full || summary) as TCGdexPriceableCard;
      const selectedSet = sets.find((set) => set.id === summary.id.slice(0, summary.id.lastIndexOf("-")));
      if (myCards.some((item) => item.id === summary.id)) { flash("That card is already on your list."); return; }
      const card = applyTCGdexDetails({ color: colorForCard(summary.name), owners: ["You"], ownerId: user.id, wanted: 1, set: selectedSet?.name }, selected, gbpRate);
      if (!full) card.set = selectedSet?.name || "Pokémon TCG";
      const stored = await saveCardRow(card);
      if (!stored) return;
      setCards((current) => [{ ...card, recordId: stored.id }, ...current]);
      setNewCard(""); setCardResults([]); setModal(null); flash(`${summary.name} added to your wish list.`);
    } catch { flash("TCGdex could not load that card just now."); }
  }
  async function toggleAvailable(card: Card) {
    const ownCard = myCards.find((item) => item.id === card.id);
    if (!ownCard) {
      const available = { ...card, recordId: undefined, ownerId: user.id, owners: ["You"], hasToTrade: true };
      const stored = await saveCardRow(available, { has_to_trade: true });
      if (!stored) return;
      setCards((current) => [{ ...available, recordId: stored.id }, ...current]);
      flash("You listed this card as available to trade.");
      return;
    }
    const next = !ownCard.hasToTrade;
    const stored = await saveCardRow({ ...ownCard, hasToTrade: next }, { has_to_trade: next });
    if (!stored) return;
    setCards((current) => current.map((item) => item.recordId === ownCard.recordId ? { ...item, hasToTrade: next } : item));
    flash(next ? "You listed this card as available to trade." : "Availability removed.");
  }
  async function saveEvent() {
    if (!supabase) return;
    const payload = { name: eventDraft.name.trim() || "My trade night", event_date: eventDraft.date || null, event_time: eventDraft.time || null, location: eventDraft.location.trim() };
    const query = creatingNight || !eventId
      ? supabase.from("trade_nights").insert({ ...payload, owner_id: user.id }).select().single()
      : supabase.from("trade_nights").update(payload).eq("id", eventId).select().single();
    const { data, error } = await query;
    if (error || !data) { setDbError(error?.message || "Could not save the trade night."); return; }
    const nextEvent = dbNightToEvent(data);
    setEvent(nextEvent); setEventDraft(nextEvent); setEventId(data.id); setEventOwnerId(data.owner_id); setCreatingNight(false);
    setTradeNights((current) => current.some((night) => night.id === data.id)
      ? current.map((night) => night.id === data.id ? { ...night, event: nextEvent } : night)
      : [{ id: data.id, event: nextEvent }, ...current]);
    setModal(null); flash("Trade night details saved.");
  }

  return (
    <main className="site-shell">
      <nav className="topbar">
        <a href="#home" className="brand"><span className="brand-mark"><span/><span/><span/><span/></span><span>trade<span className="brand-accent">table</span></span></a>
        <div className="top-links"><a href="#wishlist">Browse lists</a><a href="#people">The group</a><button className="profile-button" onClick={() => void onSignOut()}><span className="avatar avatar-you">Y</span><span>Sign out</span></button></div>
      </nav>

      <section className="hero" id="home">
        <div className="hero-text"><div className="eyebrow"><span className="live-dot"/> YOUR NEXT GATHERING</div><h1>Good trades.<br/><em>Great company.</em></h1><p>Your group’s card lists in one place.<br className="desktop-break"/> Bring your binder. We’ll bring the list.</p><button className="hero-cta" onClick={() => { setCreatingNight(true); setEventDraft({ name: "", date: "", time: "", location: "" }); setModal("event"); }}>Set up a trade night <Icon name="arrow" size={16}/></button></div>
        <div className="hero-art" aria-hidden="true"><div className="sun-disc"/><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="card-stack"><div className="hero-card hero-card-back"><span>✦</span><small>PALDEA EVOLVED</small></div><div className="hero-card hero-card-front"><span className="card-spark">✧</span><div className="mew-art">☁️<b>♡</b></div><span className="mew-label">MEW</span><small>003 / 165</small></div></div><div className="sparkle sparkle-one">✳</div><div className="sparkle sparkle-two">✦</div><div className="float-pill"><span className="mini-online"/> {people.length} {people.length === 1 ? "member" : "members"} in this night</div></div>
        <div className="hero-note"><span>✳</span> MADE FOR YOUR<br/> TRADE NIGHT</div>
      </section>

      <section className="event-strip">
        <div className="event-icon"><Icon name="calendar" size={21}/></div><div className="event-copy"><span className="micro-label">UP NEXT <span>·</span> YOUR TRADE NIGHT</span>{tradeNights.length > 1 && <select className="night-select" value={eventId || ""} onChange={(e) => { setCreatingNight(false); void selectNight(e.target.value); }} aria-label="Choose a trade night">{tradeNights.map((night) => <option key={night.id} value={night.id}>{night.event.name}</option>)}</select>}<h2>{event.name}</h2><div className="event-meta"><span><Icon name="calendar" size={14}/>{formatDate(event.date)}</span><i/><span>{formatTime(event.time)}</span>{event.location && <><i/><span><Icon name="pin" size={14}/>{event.location}</span></>}</div></div><div className="attendee-stack">{people.slice(0, 5).map((person) => <span className={`avatar avatar-${person.color}`} key={person.id} title={person.name}>{person.initials}</span>)}</div><div className="event-actions"><button className="button-light" onClick={() => { setCreatingNight(true); setEventDraft({ name: "", date: "", time: "", location: "" }); setModal("event"); }}>New night</button>{eventOwnerId === user.id && <button className="button-light" onClick={() => { setCreatingNight(false); setEventDraft(event); setModal("event"); }}>Edit night</button>}<button className="button-dark" disabled={!eventId || !dataReady} onClick={() => void shareEvent()}><Icon name="share" size={15}/> Share invite</button></div>
      </section>

      <section className="wish-section" id="wishlist">
        <div className="section-heading"><div><div className="micro-label">THE COMMUNITY WANT LIST</div><h2>What everyone’s <em>looking for.</em></h2></div><button className="add-wish" disabled={!eventId || !dataReady} onClick={() => setModal("card")}><Icon name="plus" size={17}/> Add to my list</button></div>
        <div className="toolbar"><div className="filter-tabs"><button className={filter === "Everyone" ? "filter active" : "filter"} onClick={() => setFilter("Everyone")}>Everyone <span>{cards.length}</span></button>{people.slice(0, 3).map((person) => <button key={person.id} className={filter === person.name ? "filter active" : "filter"} onClick={() => setFilter(person.name)}>{person.name}</button>)}</div><label className="search-box"><Icon name="search" size={17}/><input aria-label="Search cards" placeholder="Find a card or set..." value={search} onChange={(e) => setSearch(e.target.value)}/><kbd>⌘ K</kbd></label></div>
        <div className="cards-grid">{visibleCards.length ? visibleCards.map((card, index) => {
          const owns = card.owners;
          return <article className={`want-card ${card.color}`} key={card.recordId || card.id || card.name} style={{ animationDelay: `${index * 60}ms` }}><div className="card-topline"><span className="set-chip">{card.set}</span><button className="dots" aria-label={`More about ${card.name}`} onClick={() => flash(`${card.rarity} · ${card.number}`)}>···</button></div><div className="card-illustration">{card.image ? <img className="tcg-card-image" src={card.image} alt={`${card.name} card`} loading="lazy"/> : <><div className="illustration-glow"/><span className="pokemon-emoji">✨</span><span className="illustration-star star-a">✦</span><span className="illustration-star star-b">✧</span><span className="illustration-orbit"/></>}</div><div className="card-details"><div className="rarity-line">{card.rarity} <span>·</span> {card.number}</div><h3>{card.name}</h3><div className="card-bottom"><div className="want-count"><strong>{card.wanted}</strong><span>wanted</span></div><span className="market-price">{formatMarketPrice(card)}<small> {card.priceUnit === "GBP" ? "UK est." : card.priceUnit === "EUR" ? "Cardmarket" : "market"}</small></span></div></div><div className="card-footer"><div className="owner-avatars">{owns.slice(0, 4).map((owner) => { const person = people.find((p) => p.initials === owner); return <span key={owner} className={`avatar avatar-${person?.color || "you"}`} title={owner === "You" ? "You have this" : person?.name}>{owner === "You" ? "S" : owner}</span>; })}{owns.length > 4 && <span className="owner-overflow">+{owns.length - 4}</span>}<span className="have-label">{card.hasToTrade ? "Available" : owns.length ? (owns[0] === "You" ? "On your list" : "On member list") : "Be the first"}</span></div><button className={card.ownerId === user.id && card.hasToTrade ? "have-button selected" : "have-button"} onClick={() => void toggleAvailable(card)}>{card.ownerId === user.id && card.hasToTrade ? <><Icon name="check" size={14}/> Listed</> : "I have this"}</button></div></article>;
        }) : <div className="empty-state"><span>🔎</span><h3>No cards found</h3><p>Try another name, set, or person.</p><button onClick={() => { setSearch(""); setFilter("Everyone"); }}>Clear filters</button></div>}</div>
      <div className="list-note">Card details and images from TCGdex. UK price estimate converts Cardmarket’s EUR trend using the latest available EUR → GBP reference rate. {dataError} {dataReady ? "" : "Loading this trade night…"}</div>
      </section>

      <section className="group-strip" id="people"><div><div className="micro-label">THE CREW</div><h2>Better together.</h2><p>{people.length} {people.length === 1 ? "member" : "members"} in this night <span>·</span> {cards.filter((card) => card.hasToTrade).length} cards available</p></div><div className="group-members">{people.map((person) => <div className="member" key={person.id}><span className={`avatar avatar-${person.color}`}>{person.initials}</span><span>{person.name}</span></div>)}</div><button className="invite-button" onClick={() => void shareEvent()}><Icon name="plus" size={16}/> Invite a friend</button></section>

      <footer className="footer"><a href="#home" className="brand footer-brand"><span className="brand-mark"><span/><span/><span/><span/></span><span>trade<span className="brand-accent">table</span></span></a><span>Made for the love of the trade. <span>✳</span></span><a href="#home">Back to top ↑</a></footer>

      {dbError && <div className="db-error" role="status">{dbError}</div>}
      {notice && <div className="toast"><span className="toast-check"><Icon name="check" size={14}/></span>{notice}</div>}
      {modal && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setModal(null); }}><div className="modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><div className="micro-label">{modal === "event" ? "BRING YOUR PEOPLE TOGETHER" : modal === "card" ? "GIVE YOUR LIST A LITTLE LOVE" : "SPREAD THE WORD"}</div><h2>{modal === "event" ? "Plan a trade night." : modal === "card" ? "What are you chasing?" : "Invite your crew."}</h2></div><button className="modal-close" onClick={() => setModal(null)} aria-label="Close"><Icon name="close"/></button></div>
        {modal === "event" ? <div className="modal-form"><label>Night name<input value={eventDraft.name} onChange={(e) => setEventDraft({ ...eventDraft, name: e.target.value })} placeholder="Friday trades at mine"/></label><div className="form-row"><label>Date<input type="date" value={eventDraft.date} onChange={(e) => setEventDraft({ ...eventDraft, date: e.target.value })}/></label><label>Start time<input type="time" value={eventDraft.time} onChange={(e) => setEventDraft({ ...eventDraft, time: e.target.value })}/></label></div><label>Where are we meeting? <span className="optional">OPTIONAL</span><input value={eventDraft.location} onChange={(e) => setEventDraft({ ...eventDraft, location: e.target.value })} placeholder="Add a place or leave blank"/></label><button className="modal-submit" onClick={() => void saveEvent()}>Save the details <Icon name="arrow" size={16}/></button></div> : modal === "card" ? <div className="modal-form"><p className="modal-description">Search real Pokémon cards and sets. Pick a printing to add its real image and available market information.</p><label>Card name<input autoFocus value={newCard} onChange={(e) => setNewCard(e.target.value)} placeholder="Search cards, e.g. Gengar VMAX"/></label><label>Set <select value={selectedSetId} onChange={(e) => setSelectedSetId(e.target.value)}><option value="">All sets</option>{sets.map((set) => <option key={set.id} value={set.id}>{set.name} · {set.cardCount.total} cards</option>)}</select></label><div className="picker-meta">{sets.length ? `${sets.length} sets from TCGdex` : "Loading set list…"}{selectedSetId && ` · ${sets.find((set) => set.id === selectedSetId)?.name}`}</div><div className="card-search-results">{cardSearchLoading ? <div className="picker-message">Searching TCGdex…</div> : !newCard.trim() ? <div className="picker-message">Start typing to find cards from the selected set.</div> : cardResults.length ? cardResults.map((result) => <button className="card-result" key={result.id} onClick={() => void addTCGdexCard(result)}><span className="result-thumb">{result.image?.startsWith("https://assets.tcgdex.net/") ? <img src={`${result.image}/low.webp`} alt=""/> : "✧"}</span><span className="result-copy"><strong>{result.name}</strong><small>{sets.find((set) => set.id === result.id.slice(0, result.id.lastIndexOf("-")))?.name || "Pokémon TCG"} · #{result.localId}</small></span><Icon name="plus" size={16}/></button>) : <div className="picker-message">No matches found. Try another card name.</div>}</div><div className="picker-pricing-note">Prices use Cardmarket’s European market data. TCGdex does not provide a native GBP market feed, so displayed UK prices are estimates converted from EUR.</div></div> : <div className="modal-form"><p className="modal-description">Send this link to the group chat and get those binders ready.</p><div className="share-link"><span>{inviteUrl || "Create an invite link first."}</span><button disabled={!inviteUrl} onClick={() => { void navigator.clipboard?.writeText(inviteUrl).then(() => { setModal(null); flash("Trade night invite link copied!"); }); }}><Icon name="link" size={16}/> Copy</button></div><button className="modal-submit" onClick={() => void shareEvent()}><Icon name="share" size={16}/> Create invite link</button></div>}
      </div></div>}
    </main>
  );
}

function dbNightToEvent(row: { name: string; event_date?: string | null; event_time?: string | null; location?: string | null }): EventData {
  return { name: row.name, date: row.event_date || "", time: row.event_time?.slice(0, 5) || "", location: row.location || "" };
}
function colorForCard(name: string) {
  const colors = ["violet", "plum", "sun", "rose"];
  return colors[name.split("").reduce((total, char) => total + char.charCodeAt(0), 0) % colors.length];
}
function applyTCGdexDetails(base: Partial<Card>, card: TCGdexPriceableCard, gbpRate: number | null): Card {
  const market = card.pricing?.cardmarket;
  const marketEur = [market?.["trend-holo"], market?.trend, market?.["avg-holo"], market?.avg30, market?.avg]
    .find((price): price is number => typeof price === "number" && Number.isFinite(price) && price > 0) ?? null;
  return {
    ...base,
    id: card.id,
    name: card.name,
    set: card.set?.name || base.set || "Pokémon TCG",
    number: `${card.localId}${card.set?.cardCount?.official ? `/${card.set.cardCount.official}` : ""}`,
    rarity: card.rarity || base.rarity || "Pokémon card",
    image: card.image?.startsWith("https://assets.tcgdex.net/") ? `${card.image}/low.webp` : undefined,
    color: base.color || colorForCard(card.name),
    owners: base.owners || [],
    wanted: base.wanted || 1,
    marketEur,
    price: marketEur === null ? null : gbpRate === null ? marketEur : marketEur * gbpRate,
    priceUnit: gbpRate === null ? "EUR" : "GBP",
    dataLoaded: true,
  };
}
function formatMarketPrice(card: Card) {
  if (typeof card.price !== "number") return "No data";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: card.priceUnit || "EUR", maximumFractionDigits: 2 }).format(card.price);
}
function formatDate(value: string) { if (!value) return "Date to be announced"; return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)); }
function formatTime(value: string) { if (!value) return "Time to be announced"; const [h, m] = value.split(":").map(Number); const suffix = h >= 12 ? "pm" : "am"; return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix}`; }
