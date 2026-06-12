"""Centralized logging configuration.

Provides per-module loggers and a setup function to configure
the root handler once at startup.  Call ``setup_logging(verbose)``
from the CLI entry point; every other module simply does::

    import logging
    log = logging.getLogger(__name__)
"""
import logging

LOG_FORMAT = "%(message)s"


def setup_logging(verbose=False):
    """Configure the root logger for the application.

    Args:
        verbose: If True, set level to DEBUG; otherwise INFO.
    """
    level = logging.DEBUG if verbose else logging.INFO
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    root = logging.getLogger()
    root.setLevel(level)
    root.addHandler(handler)
