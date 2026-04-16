from app.engine.rng import subsystem_rng


def test_same_inputs_produce_same_random_sequence():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(42, "rd", 2026, 2)
    seq_a = [a.random() for _ in range(5)]
    seq_b = [b.random() for _ in range(5)]
    assert seq_a == seq_b


def test_different_subsystems_produce_different_sequences():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(42, "acquisition", 2026, 2)
    assert a.random() != b.random()


def test_different_quarters_produce_different_sequences():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(42, "rd", 2026, 3)
    assert a.random() != b.random()


def test_different_seeds_produce_different_sequences():
    a = subsystem_rng(42, "rd", 2026, 2)
    b = subsystem_rng(43, "rd", 2026, 2)
    assert a.random() != b.random()


def test_returns_random_instance():
    import random as stdlib_random
    rng = subsystem_rng(1, "x", 2026, 1)
    assert isinstance(rng, stdlib_random.Random)
