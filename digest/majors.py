"""Recognising major-label names (Universal, Sony, Warner and labels they own)."""
from .util import norm

# Compared after dropping filler words like "records" and "music".
MAJOR_CORES = {
    # Universal
    "universal", "umg", "island", "polydor", "virgin", "virgin emi", "emi", "capitol",
    "decca", "deutsche grammophon", "interscope", "geffen", "def jam", "republic",
    "motown", "mercury", "verve", "blue note", "fiction", "caroline", "astralwerks",
    "emi records", "universal music operations",
    # Sony
    "sony", "columbia", "rca", "epic", "ministry of sound", "syco", "arista",
    "black butter", "legacy", "relentless", "orchard", "awal", "masterworks",
    # Warner
    "warner", "atlantic", "parlophone", "elektra", "rhino", "asylum", "east west",
    "sire", "reprise", "nonesuch", "erato", "warner classics", "ada", "spinnin",
}
MAJOR_PREFIXES = (
    "universal music", "sony music", "warner music", "warner records", "warner bros",
    "warner classics", "emi ", "virgin emi", "island records", "atlantic records",
    "columbia records", "polydor", "parlophone",
)
FILLER = {"records", "recordings", "music", "ltd", "limited", "uk", "group", "entertainment",
          "inc", "label", "the", "company", "co"}


def core(name):
    return " ".join(w for w in norm(name).split() if w not in FILLER)


def is_major(name, never_exclude=()):
    if not name:
        return False
    if norm(name) in {norm(n) for n in never_exclude}:
        return False
    n = norm(name)
    return core(name) in MAJOR_CORES or any(n.startswith(p.strip()) for p in MAJOR_PREFIXES)
