import { Buffer } from 'buffer';

import $ from 'umbrellajs';
import * as d3 from 'd3';

import chardet from '../deps/node-chardet-0.7.0';
import iconv from '../deps/iconv-lite-0.4.24';

import parseTJA from './parseTJA';
import drawChart from './drawChart';
import analyseChart from './analyseChart';

import '../css/style.scss';
import '../css/Pixel-3x5.css';

//==============================================================================

const $editorLive = $('.editor-live'),
      $editorProcess = $('.editor-process');
const $input = $('.area-editor .input');
const $errors = $('.area-errors .errors');

let tjaParsed = null;
let selectedDifficulty = '';
let selectedPage = 'preview';

function displayErrors(message) {
  $errors.text(message);
}

function updateUI() {
  $('.controls-diff .button.is-active').removeClass('is-active');
  $(`.controls-diff .btn-diff-${selectedDifficulty}`).addClass('is-active');

  $('.controls-page .button.is-active').removeClass('is-active');
  $(`.controls-page .btn-page-${selectedPage}`).addClass('is-active');

  $('.area-pages .page').addClass('is-hidden');
  $(`.area-pages .page-${selectedPage}`).removeClass('is-hidden');

  if (selectedPage === 'preview' && selectedDifficulty !== '') showPreview();
  else hidePreview();

  if (selectedPage === 'statistics') showStatistics();
}

function processTJA() {
  try {
    tjaParsed = parseTJA($input.first().value);

    $('.controls-diff .button').addClass('is-hidden');
    for (let diff in tjaParsed.courses)
      $(`.controls-diff .btn-diff-${diff}`).removeClass('is-hidden');

    displayErrors('No error');
  } catch (e) {
    console.error(e);
    displayErrors(e.message);
  }
}

function showPreview() {
  if (selectedDifficulty === '') return;

  try {
    $('#tja-preview').remove();

    document.fonts.load('5px "Pixel 3x5"').then(() => {
      const $canvas = drawChart(tjaParsed, selectedDifficulty);
      $canvas.id = 'tja-preview';
      $('.page-preview').append($canvas);

      displayErrors('No error');
    });
  } catch (e) {
    console.error(e);
    displayErrors(e.message);
  }
}

function hidePreview() {
  $('#tja-preview').remove();
}

function showStatistics() {
  if (selectedDifficulty === '') return;

  try {
    const data = analyseChart(tjaParsed, selectedDifficulty);
    buildStatisticsPage(data);
  } catch (e) {
    console.error(e);
    displayErrors(e.message);
  }
}

function buildStatisticsPage(data) {
  const { statistics: stats, graph } = data;

  // Statistics
  $('.stat-total-combo').text(stats.totalCombo);

  $('.stat-don-small').text(stats.notes[0]);
  $('.stat-don-big').text(stats.notes[2]);
  $('.stat-kat-small').text(stats.notes[1]);
  $('.stat-kat-big').text(stats.notes[3]);

  const statDon = stats.notes[0] + stats.notes[2];
  const statKat = stats.notes[1] + stats.notes[3];
  $('.stat-don').text(statDon);
  $('.stat-kat').text(statKat);

  const statDonRatio = (statDon / stats.totalCombo) * 100;
  const statKatRatio = 100 - statDonRatio;
  $('.stat-don-ratio').text(statDonRatio.toFixed(2) + '%');
  $('.stat-kat-ratio').text(statKatRatio.toFixed(2) + '%');

  $('.stat-density').text((stats.totalCombo / stats.length).toFixed(3));
  $('.stat-length').text(stats.length.toFixed(2));

  $('.stat-renda').text(stats.rendas.map(r => r.toFixed(3) + '秒').join(' + '));
  $('.stat-renda-total').text(stats.rendas.reduce((a, b) => a + b, 0).toFixed(3));

  $('.stat-balloon').html(stats.balloons.map(b => (
    `${b[0].toFixed(3)}秒 / ${b[1]}打 (${(b[1] / b[0]).toFixed(3)}打/秒)`
  )).join('<br>'));

  // Graph
  const graphWidth = 600, graphHeight = 200;
  const x = d3.scaleBand().rangeRound([ 0, graphWidth ]),
        y = d3.scaleLinear().rangeRound([ graphHeight, 0 ]);
  const yMax = Math.ceil(graph.max / 5) * 5,
        yTickValues = [...Array(yMax / 5 + 1).keys()].map(i => i * 5);

  $('.stat-graph').empty();
  const graphSvg = d3
    .select('.stat-graph')
      .attr('width', graphWidth + 50).attr('height', graphHeight + 40)
    .append('g')
      .attr('transform', 'translate(30, 20)');

  const layers = d3.stack().keys(['don', 'kat'])(graph.data);

  x.domain(layers[0].map((d, idx) => idx));
  y.domain([0, Math.ceil(graph.max / 5) * 5]);

  const makeAxisY = () => d3.axisLeft(y).ticks(5).tickValues(yTickValues);

  graphSvg.append('g')
    .attr('class', 'grid')
    .call(makeAxisY().tickSize(-graphWidth).tickFormat(''));

  const layer = graphSvg
    .selectAll('.layer')
      .data(layers)
    .enter().append('g')
      .attr('class', 'layer')
      .style('fill', (d, i) => ['#f44e', '#44fe'][i]);

  layer
    .selectAll('rect')
      .data(d => d)
    .enter().append('rect')
      .attr('x', (d, idx) => x(idx))
      .attr('y', d => y(d[1]))
      .attr('height', d => y(d[0]) - y(d[1]))
      .attr('width', x.bandwidth);

  graphSvg.append('g')
    .attr('class', 'axis-y')
    .call(makeAxisY());
}

//==============================================================================

$editorProcess.on('click', () => {
  processTJA();
  showPreview();
});

$input.on('input', () => {
  if ($editorLive.first().checked) {
    processTJA();
    updateUI();
  }
});

$input.on('dragover', e => {
  e.stopPropagation();
  e.preventDefault();
  e.dataTransfer.dropEffect = 'cppy';
});

$input.on('drop', dropEvt => {
  dropEvt.stopPropagation();
  dropEvt.preventDefault();

  const file = dropEvt.dataTransfer.files[0];

  const reader = new FileReader();

  reader.onload = readerEvt => {
    const arrayBuffer = readerEvt.target.result;
    const uintArray = new Uint8Array(arrayBuffer);
    const buffer = Buffer.from(uintArray);

    const encoding = chardet.detect(buffer);
    const content = iconv.decode(buffer, encoding);

    $input.first().value = content;
    selectedDifficulty = '';

    processTJA();
    updateUI();
  };

  reader.readAsArrayBuffer(file);
});

$('.controls-diff .button').on('click', evt => {
  const diff = $(evt.target).data('value');

  selectedDifficulty = diff;
  updateUI();
});

$('.controls-page .button').on('click', evt => {
  const page = $(evt.target).data('value');

  selectedPage = page;
  updateUI();
});

//==============================================================================

if ($input.first().value) {
  processTJA();
}

updateUI();
