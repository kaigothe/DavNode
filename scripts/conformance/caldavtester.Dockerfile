# CalDAVTester (Apple's CalDAV/CardDAV test suite) is Python 2 code, which
# current CI runners no longer offer; this image provides it. The two
# checkouts are made by run-caldavtester.sh at pinned commits and copied in.
FROM python:2.7
COPY ccs-pycalendar /opt/ccs-pycalendar
COPY ccs-caldavtester /opt/ccs-caldavtester
RUN pip install --quiet /opt/ccs-pycalendar && pip install --quiet -e /opt/ccs-caldavtester
WORKDIR /opt/ccs-caldavtester
