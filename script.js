/**
 * PVLng - PhotoVoltaic Logger new generation (https://pvlng.com/)
 *
 * @link       https://github.com/KKoPV/PVLng
 * @author     Knut Kohl <github@knutkohl.de>
 * @copyright  2012-2016 Knut Kohl
 * @license    MIT License (MIT) http://opensource.org/licenses/MIT
 */

/**
 * Settings
 */
var APIUrl = '//' + config.host + '/api/latest/',
    languages = [ 'en', 'de' ], // Available languages
    colors = [
        '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
        '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1'
    ];

/**
 * Defaults and helper
 */
var color_act = colors[0],
    color_est = colors[2],
    chartOptions = {
        chart: {
            spacingLeft:   0,
            spacingTop:    5,
            spacingRight:  0,
            spacingBottom: 0
        },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { type: 'datetime' }
    },
    i18n;

/**
 * Detect prefered language from browser language
 */
function getUserLanguage(languages) {
    var userLang = (window.navigator.languages || [window.navigator.language || window.navigator.userLanguage])
                   // Get only the first 2 characters in lowercase
                   .map( function(lang) { return lang.substring(0, 2).toLowerCase() } )
                   // Get only unique languages
                   .filter( function(value, index, self) { return self.indexOf(value) === index } )
    // Search prefered language in available languages
    for (var i=0; i<userLang.length; i++) {
        if (languages.indexOf(userLang[i]) != -1) return userLang[i];
    }
    // Fallback to first available language
    return languages[0];
}

/**
 * Load data, fill badges and draw charts
 */
function loadData() {

    var container = $('.badges'), now = new Date();

    if (!container.children().length) {
        // 1st call, create badges by cloning template
        var tpl = $($('#badge-template').html());
        $(config.badges).each(function(id, badge) {
            var el = tpl.clone();
            $('.channel-icon', el).addClass('fa-' + badge.icon);
            el.prop('id', 'badge-'+id).appendTo(container);
        });
        $('body').css({ opacity: 1 });
    }

    // Get data
    $(config.badges).each(function(id, badge) {

        var url = APIUrl, data = { attributes: true };

        if (['sunrise', 'sunset'].indexOf(badge.guid) != -1) {
            data.format = 'H:i';
        } else {
            url += 'data/last/';
        }

        $.ajax({
            url:        url + badge.guid,
            jsonp:      'callback',
            dataType:   'jsonp',
            data:       data,
            success:    function(data) {

                var attr = data.shift(),
                    name = i18n._(attr.name, true),
                    el   = '#badge-'+id;

                if (attr.description) name += ' (' + attr.description + ')';

                $('.channel-name', el).html(name);
                $('.channel-unit', el).html(attr.unit);

                if (data.length) {
                    // Todays data exists

                    var d = new Date(data[0].timestamp*1000),
                        v = attr.numeric // Round as needed
                          ? data[0].data.toFixed(badge.decimals != null ? badge.decimals : attr.decimals)
                          : data[0].data;

                    // Max. age 10 minutes, mostly for power channels
                    if (attr.meter === 0 && d.getTime() + 10*60*1000 < now.getTime()) {
                        v = '-';
                    }

                    // -0 is bad...
                    if (v == '-0') v = '0';

                    $('.last-value', el).html(v);

                    $('.panel-footer .pull-left', el).html(d.toLocaleDateString());
                    $('.panel-footer .pull-right', el).html(d.toLocaleTimeString());

                } else {

                    $('.last-value, .panel-footer .pull-left, .panel-footer .pull-right', el)
                    .html('?');

                }
            }
        });
    });

    if (config.power) {
        $('.chart-wrapper.power').show();

        // Day chart
        $.getJSON(
            APIUrl + 'data/' + config.power + '?callback=?',
            {
                attributes: true,
                period: '5i',
                short: true
            },
            function(data) {
                var attr = data.shift(), _data = [];
                for (i=0; i<data.length; i++) {
                    _data.push([ data[i][0]*1000, data[i][1] ]);
                }
                var name = $('<div/>').html(attr.name).text();
                var options = $.extend(chartOptions, {
                    title: { text: name },
                    tooltip: {
                        shared: true,
                        valueSuffix: ' ' + attr.unit,
                        xDateFormat: '%H:%M'
                    },
                    yAxis: { title: { text: attr.unit } },
                    series: [{
                        color: color_act,
                        name: name,
                        marker: { enabled: false },
                        type: 'areaspline',
                        data: _data
                    }]
                });
                drawChart('day-chart', options);
            }
        );
    }

    if (config.energy) {
        // Generate charts
        $('.chart-wrapper.energy').show();

        // Week and month chart
        $.getJSON(
            APIUrl + 'data/' + config.energy + '?callback=?',
            {
                attributes: true,
                period: '1d',
                start: -30, // Last 30 days
                short: true
            },
            function(data) {
                var attr = data.shift(), data30 = [], offset = 0;
                for (i=0; i<data.length; i++) {
                    data30.push([ data[i][0]*1000, +(data[i][1]-offset).toFixed(attr.decimals) ]);
                    offset = data[i][1];
                }
                var m1 = now.getMonth(),
                    m2 = (now.getDate() > 15) ? m1 + 1 : m1 - 1;

                // 1st half of januar        2nd half of december
                if (m2 < 0) m2 = 11; else if (m2 > 11) m2 = 0;

                var options = $.extend(chartOptions, {
                    tooltip: {
                        valueSuffix: ' ' + attr.unit,
                        xDateFormat: '%Y-%m-%d'
                    },
                    yAxis: {
                        plotBands: [{
                            color: color_est,
                            from: 0,
                            to: (config.estimate[m1] + config.estimate[m2]) / 2 / 30
                        }],
                        title: { text: attr.unit }
                    }
                })
                // Week chart
                options.series = [{
                    color: color_act,
                    name: $('<div/>').html(attr.name).text(),
                    type: 'column',
                    data: data30.slice(-7) // Last 7 days
                }];
                drawChart('week-chart', options);
                // Month chart
                options.series[0].data = data30;
                drawChart('month-chart', options);
            }
        );

        // Year chart
        var start = new Date(new Date().getFullYear(), 0, 1); // 1st of Jan

        $.getJSON(
            APIUrl + 'data/' + config.energy + '?callback=?',
            {
                attributes: true,
                period: '7d',
                full: true,
                start: start.getTime()/1000
            },
            function(data) {

                var attr = data.shift(), _data = [], _est = [], d = new Date(), last;

                for (i=0; i<data.length; i++) {
                    _data.push([ data[i]['timestamp']*1000, Math.round(data[i]['consumption'], 0) ]);
                    // Calc actual month of timestamp
                    d = new Date(data[i]['timestamp']*1000);
                    // Add estimate on month change and last at last row
                    if (d.getMonth() != last || i == data.length-1) {
                        // Average month length of 30.4 days
                        _est.push( [ data[i]['timestamp']*1000, +(config.estimate[d.getMonth()]/30.4*7).toFixed(0) ]);
                        last = d.getMonth();
                    }
                }

                var end = new Date(new Date().getFullYear()+1, 0, 1); // 1st of Jan next year

                // Fill estimated data until end of year
                while (d < end) {
                    d = new Date(d.getTime() + 7 * 8.64e7);
                    if (d.getMonth() != last || i == data.length-1) {
                        _est.push([ d.getTime(), +(config.estimate[d.getMonth()]/30.4*7).toFixed(0) ]);
                        last = d.getMonth();
                    }
                }

                // Last row is AFTER end, so remove it
                _est.pop();

                var series = [{
                    color: color_act,
                    // HTML decode name
                    name: $('<div/>').html(attr.name).text(),
                    type: 'column',
                    data: _data
                }];

                // Estimates defined?
                if (config.estimate.reduce(function(a, b) { return a+b }, 0)) {
                    series.push({
                        color: color_est,
                        name: i18n._('estimate'),
                        marker: { enabled: false },
                        type: 'spline',
                        data: _est
                    });
                }

                drawChart('year-chart', $.extend(chartOptions, {
                    tooltip: {
                        shared: true,
                        valueSuffix: ' ' + attr.unit,
                        xDateFormat: '%Y-%m-%d'
                    },
                    yAxis: { title: { text: attr.unit } },
                    series: series,
                }));

            }
        );
    }
}

/**
 * Create chart with aspect ratio
 */
function drawChart(container, options) {
    options.chart.height = $('#'+container).width() * 9 / 16;
    Highcharts.chart(container, options);
}

/**
 * Resize chart according to chart container
 */
function resizeChart(container) {
    w = container.width();
    container.highcharts().setSize(w, w * 9 / 16, true);
}

/**
 * Translate texts
 */
function translate(languages) {
    var l = languages;
    this._ = function(text, lazy) {
        return l[text] ? l[text] : (lazy ? text : '{{' + text + '}}');
    }
}

/**
 *
 */
$(function() {

    $(window).on('resize', function() {
        $('.highcharts-container').each(function(id, chart) {
            resizeChart($(chart).parent())
        });
    });

    $.when(
        $.getJSON(APIUrl + 'settings/title?callback=?'),
        $.getJSON(APIUrl + 'translate/' + getUserLanguage(languages) + '/dashboard?callback=?')
    ).done(function(title, texts) {

        $('span', '.page-header').html(title[0]);
        document.title = $('.page-header').text();

        i18n = new translate(texts[0]);
        $('.i18n').each(function(id, el) {
            el = $(el);
            el.html(i18n._(el.data('i18n')));
        });

        loadData();
    });

});
