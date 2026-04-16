from app.content.registry import platforms, bases, objectives, rd_programs, reload_all


def test_seed_platforms_loadable():
    reload_all()
    p = platforms()
    assert "rafale_f4" in p
    assert "tejas_mk1a" in p
    assert "su30_mki" in p
    assert "j20a" in p
    assert "j10c" in p
    # Sanity: 10 platforms minimum
    assert len(p) >= 10


def test_seed_bases_loadable():
    reload_all()
    b = bases()
    assert "ambala" in b
    assert "hasimara" in b
    assert "jodhpur" in b


def test_seed_objectives_loadable():
    reload_all()
    o = objectives()
    assert len(o) >= 3


def test_seed_rd_programs_loadable():
    reload_all()
    r = rd_programs()
    assert "amca_mk1" in r
    assert "astra_mk2" in r
